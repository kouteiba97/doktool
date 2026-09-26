// Phase 14 exit criterion: a verified doctor buys DokTool Pro through the payment provider (the fake
// provider here), gets PROFESSIONAL access, renews manually, and nothing about money is refundable.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { SubscriptionLifecycleService } from '../../src/modules/billing/subscription-lifecycle.service.js';
import { type AdminActor, adminActor, userActor } from './actors.js';
import { useTestApp } from './app.js';

const app = useTestApp();
let superAdmin: AdminActor;
let monthlyId: string;
let code: string;

type Auth = Record<string, string>;

beforeAll(async () => {
  superAdmin = await adminActor(app);
  code = `PRO_${randomUUID().slice(0, 6).toUpperCase().replace(/-/g, '')}`;
  const plan = await superAdmin
    .post('/admin/v1/plans')
    .send({
      code,
      nameFr: 'DokTool Pro mensuel',
      nameEn: 'DokTool Pro monthly',
      audience: ['DOCTOR', 'RESIDENT'],
      priceMinor: 150_000,
      durationDays: 30,
      includesFr: ['Toute la bibliothèque de référence'],
      includesEn: ['The whole reference library'],
      excludesFr: [
        'Pas de base de médicaments',
        'Pas de rédaction d’ordonnances ni de certificats',
      ],
      excludesEn: ['No drug database', 'No prescription or certificate writing'],
      isPurchasable: true,
      reason: 'Launch price',
    })
    .expect(200);
  monthlyId = plan.body.id;
});

const pathOf = (url: string) => `${new URL(url).pathname}${new URL(url).search}`;

function checkout(auth: Auth, overrides: Record<string, unknown> = {}) {
  return app
    .http()
    .post('/v1/subscription/checkout')
    .set(auth)
    .send({
      planId: monthlyId,
      provider: 'SATIM_CIB',
      acknowledged: true,
      acknowledgementVersion: 'pro-no-refund-v1',
      ...overrides,
    });
}

/** Pays (or refuses) on the fake provider's page, then follows the return URL like a browser. */
async function payOnProviderPage(redirectUrl: string, outcome: 'PAID' | 'FAILED') {
  const orderId = new URL(redirectUrl).searchParams.get('orderId')!;
  await app.http().get(pathOf(redirectUrl)).expect(200);
  const redirected = await app
    .http()
    .post('/v1/subscription/checkout/fake-page')
    .type('form')
    .send({ orderId, outcome })
    .expect(303);
  return app.http().get(pathOf(redirected.headers.location!)).expect(200);
}

const tier = async (auth: Auth) =>
  (await app.http().get('/v1/me/access').set(auth).expect(200)).body.tier as string;

describe('plans', () => {
  it('versions a plan on every change and sells only the latest version', async () => {
    const next = await superAdmin
      .post('/admin/v1/plans')
      .send({
        code,
        nameFr: 'DokTool Pro mensuel',
        nameEn: 'DokTool Pro monthly',
        audience: ['DOCTOR', 'RESIDENT'],
        priceMinor: 160_000,
        durationDays: 30,
        includesFr: [],
        includesEn: [],
        excludesFr: [],
        excludesEn: [],
        isPurchasable: false,
        reason: 'Draft of the next price',
      })
      .expect(200);
    expect(next.body).toMatchObject({ code, version: 2, isPurchasable: false });
    const all = await superAdmin.get('/admin/v1/plans').expect(200);
    const versions = all.body.filter((plan: { code: string }) => plan.code === code);
    expect(
      versions.map((plan: { version: number; isPurchasable: boolean }) => [
        plan.version,
        plan.isPurchasable,
      ]),
    ).toEqual([
      [2, false],
      [1, true],
    ]);
  });

  it('never sells to students, and needs the plans grant', async () => {
    await superAdmin
      .post('/admin/v1/plans')
      .send({
        code: 'STUDENT_PLAN',
        nameFr: 'x',
        nameEn: 'x',
        audience: ['STUDENT'],
        priceMinor: 10_000,
        durationDays: 30,
        includesFr: [],
        includesEn: [],
        excludesFr: [],
        excludesEn: [],
        isPurchasable: true,
        reason: 'Not allowed',
      })
      .expect(400);
    const finance = await adminActor(app, 'FINANCE_ADMIN');
    await finance.get('/admin/v1/plans').expect(200);
    await finance
      .post(`/admin/v1/plans/${monthlyId}/sale`)
      .send({ isPurchasable: false, reason: 'No' })
      .expect(403);
  });

  it('opens checkout only once professional verification is VERIFIED', async () => {
    const student = await userActor(app, 'STUDENT');
    const forStudent = await app.http().get('/v1/subscription/plans').set(student.auth).expect(200);
    expect(forStudent.body).toMatchObject({ eligibility: { state: 'STUDENT_FREE' }, plans: [] });

    const doctor = await userActor(app, 'PROFESSIONAL_UNPAID');
    const forDoctor = await app.http().get('/v1/subscription/plans').set(doctor.auth).expect(200);
    expect(forDoctor.body.eligibility).toEqual({ state: 'OPEN', renewal: false });
    expect(forDoctor.body.plans.some((plan: { id: string }) => plan.id === monthlyId)).toBe(true);
    expect(forDoctor.body.acknowledgementVersion).toBe('pro-no-refund-v1');

    await app.prisma().verificationCase.updateMany({
      where: { userId: doctor.userId },
      data: { status: 'EXPIRED' },
    });
    const expired = await app.http().get('/v1/subscription/plans').set(doctor.auth).expect(200);
    expect(expired.body.eligibility.state).toBe('VERIFICATION_REQUIRED');
    await checkout(doctor.auth).expect(409);
  });
});

describe('checkout', () => {
  it('activates DokTool Pro after a payment confirmed with the provider', async () => {
    const { userId, auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    expect(await tier(auth)).toBe('PROFESSIONAL_UNPAID');
    const started = await checkout(auth).expect(200);
    expect(started.body.transactionId).toMatch(/^DT-\d{4}-\d{6}$/);

    const resumed = await checkout(auth).expect(200);
    expect(resumed.body).toEqual(started.body);
    await checkout(auth, { provider: 'SATIM_EDAHABIA' }).expect(409);

    const page = await payOnProviderPage(started.body.redirectUrl, 'PAID');
    expect(page.text).toContain('Paiement confirmé');

    const transaction = await app
      .http()
      .get(`/v1/subscription/transactions/${started.body.transactionId}`)
      .set(auth)
      .expect(200);
    expect(transaction.body).toMatchObject({
      status: 'SUCCEEDED',
      amountMinor: 150_000,
      currency: 'DZD',
      planCode: code,
    });
    expect(await tier(auth)).toBe('PROFESSIONAL');

    const overview = await app.http().get('/v1/subscription').set(auth).expect(200);
    expect(overview.body.subscription).toMatchObject({ status: 'ACTIVE', plan: { id: monthlyId } });
    expect(overview.body.eligibility.state).toBe('ACTIVE');
    const end = new Date(overview.body.subscription.currentPeriodEnd).getTime();
    expect(end - Date.now()).toBeGreaterThan(29 * 86_400_000);

    const notifications = await app
      .prisma()
      .notification.count({ where: { userId, type: 'subscription.activated' } });
    expect(notifications).toBe(1);

    const stored = await app
      .prisma()
      .transaction.findUniqueOrThrow({ where: { transactionId: started.body.transactionId } });
    expect(stored.metadata).toMatchObject({ acknowledgement: 'pro-no-refund-v1', renewal: false });
    await expect(
      app.prisma().transaction.update({ where: { id: stored.id }, data: { amountMinor: 1 } }),
    ).rejects.toThrow();
    await expect(app.prisma().transaction.delete({ where: { id: stored.id } })).rejects.toThrow();
    expect(
      await app.prisma().transaction.count({ where: { id: stored.id, amountMinor: 150_000 } }),
    ).toBe(1);
  });

  it('keeps a refused payment with the provider’s message and lets the person try again', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    const first = await checkout(auth).expect(200);
    await payOnProviderPage(first.body.redirectUrl, 'FAILED');
    const refused = await app
      .http()
      .get(`/v1/subscription/transactions/${first.body.transactionId}`)
      .set(auth)
      .expect(200);
    expect(refused.body).toMatchObject({
      status: 'FAILED',
      providerMessage: 'Paiement refusé (simulation).',
    });
    expect(await tier(auth)).toBe('PROFESSIONAL_UNPAID');

    const second = await checkout(auth, { provider: 'SATIM_EDAHABIA' }).expect(200);
    expect(second.body.transactionId).not.toBe(first.body.transactionId);
    await payOnProviderPage(second.body.redirectUrl, 'PAID');
    expect(await tier(auth)).toBe('PROFESSIONAL');
  });

  it('requires the no-refund acknowledgement in its current version', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    await checkout(auth, { acknowledged: false }).expect(400);
    await checkout(auth, { acknowledgementVersion: 'old' }).expect(400);
  });
});

describe('renewal', () => {
  it('opens 14 days before the end and extends the same subscription', async () => {
    const { userId, auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    const first = await checkout(auth).expect(200);
    await payOnProviderPage(first.body.redirectUrl, 'PAID');
    await checkout(auth).expect(409);

    const subscription = await app
      .prisma()
      .subscription.findFirstOrThrow({ where: { userId, status: 'ACTIVE' } });
    const end = new Date(Date.now() + 10 * 86_400_000);
    await app
      .prisma()
      .subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: end } });

    const plans = await app.http().get('/v1/subscription/plans').set(auth).expect(200);
    expect(plans.body.eligibility).toEqual({ state: 'OPEN', renewal: true });
    const renewal = await checkout(auth).expect(200);
    await payOnProviderPage(renewal.body.redirectUrl, 'PAID');

    const renewed = await app
      .prisma()
      .subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.currentPeriodEnd!.getTime()).toBe(end.getTime() + 30 * 86_400_000);
    expect(
      await app
        .prisma()
        .subscription.count({ where: { userId, status: { in: ['ACTIVE', 'GRACE'] } } }),
    ).toBe(1);
  });

  it('keeps access in grace for 7 days, then ends, with notifications only', async () => {
    const { userId, auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    const paid = await checkout(auth).expect(200);
    await payOnProviderPage(paid.body.redirectUrl, 'PAID');
    const subscription = await app
      .prisma()
      .subscription.findFirstOrThrow({ where: { userId, status: 'ACTIVE' } });
    const lifecycle = app.get(SubscriptionLifecycleService);

    await app.prisma().subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEnd: new Date(Date.now() + 3 * 86_400_000 - 60_000) },
    });
    await lifecycle.remind();
    await lifecycle.remind();
    expect(
      await app.prisma().notification.count({ where: { userId, type: 'subscription.renewal' } }),
    ).toBe(1);

    await app.prisma().subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: new Date(Date.now() - 31 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() - 1000),
      },
    });
    await lifecycle.advance();
    const grace = await app
      .prisma()
      .subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(grace.status).toBe('GRACE');
    expect(await tier(auth)).toBe('PROFESSIONAL');

    await app.prisma().subscription.update({
      where: { id: subscription.id },
      data: { graceEndsAt: new Date(Date.now() - 1000) },
    });
    await lifecycle.advance();
    expect(
      (await app.prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } }))
        .status,
    ).toBe('EXPIRED');
    expect(await tier(auth)).toBe('PROFESSIONAL_UNPAID');
    expect(
      await app.prisma().notification.count({ where: { userId, type: 'subscription.ended' } }),
    ).toBe(1);
  });

  it('records « Ne pas renouveler » and keeps access to the period end', async () => {
    const { userId, auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    const paid = await checkout(auth).expect(200);
    await payOnProviderPage(paid.body.redirectUrl, 'PAID');
    await app.http().post('/v1/subscription/stop-renewal').set(auth).expect(204);
    const canceled = await app
      .prisma()
      .subscription.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } });
    expect(canceled.status).toBe('CANCELED');
    expect(await tier(auth)).toBe('PROFESSIONAL');
    await app.http().post('/v1/subscription/stop-renewal').set(auth).expect(409);
  });
});

describe('reconciliation', () => {
  it('cancels checkouts abandoned for an hour', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    const started = await checkout(auth).expect(200);
    await app.prisma().transaction.update({
      where: { transactionId: started.body.transactionId },
      data: { createdAt: new Date(Date.now() - 2 * 3600_000) },
    });
    await app.get(SubscriptionLifecycleService).reconcile();
    const transaction = await app.prisma().transaction.findUniqueOrThrow({
      where: { transactionId: started.body.transactionId },
    });
    expect(transaction.status).toBe('CANCELED');
  });
});
