// Ready-made people for end-to-end tests: an admin with a live session, users in each tier, a demo.
import { randomUUID } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { AdminAccountsService } from '../../src/modules/admin-auth/admin-accounts.service.js';
import type { Preset } from '../../src/modules/admin-auth/grants.js';
import { TEST_ADMIN_ORIGIN, TEST_TERMS_VERSION } from '../support/env.js';
import { type TestApp, uniqueEmail } from './app.js';

export interface AdminActor {
  id: string;
  cookie: string;
  get: (path: string) => ReturnType<ReturnType<TestApp['http']>['get']>;
  post: (path: string) => ReturnType<ReturnType<TestApp['http']>['post']>;
  patch: (path: string) => ReturnType<ReturnType<TestApp['http']>['patch']>;
}

export async function adminActor(
  app: TestApp,
  preset: Preset = 'SUPER_ADMIN',
): Promise<AdminActor> {
  const email = uniqueEmail('admin');
  const password = 'admin password for tests';
  const { id } = await app
    .get(AdminAccountsService)
    .create({ email, fullName: `Test ${preset}`, password, preset, grantedById: null });
  const step = await app
    .http()
    .post('/admin/v1/auth/sign-in')
    .set('Origin', TEST_ADMIN_ORIGIN)
    .send({ email, password })
    .expect(200);
  const code = TOTP.generate({ secret: Secret.fromBase32(step.body.enrollment.secretBase32) });
  const session = await app
    .http()
    .post('/admin/v1/auth/totp')
    .set('Origin', TEST_ADMIN_ORIGIN)
    .send({ challengeToken: step.body.challengeToken, code })
    .expect(200);
  const cookie = ([] as string[])
    .concat(session.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('__Host-doktool_admin='))!
    .split(';')[0]!;
  return {
    id,
    cookie,
    get: (path) => app.http().get(path).set('Cookie', cookie),
    post: (path) => app.http().post(path).set('Cookie', cookie).set('Origin', TEST_ADMIN_ORIGIN),
    patch: (path) => app.http().patch(path).set('Cookie', cookie).set('Origin', TEST_ADMIN_ORIGIN),
  };
}

export type Tier = 'STUDENT' | 'PROFESSIONAL_UNPAID' | 'PROFESSIONAL';

/** A confirmed account placed in `tier` through real verification and subscription rows. */
export async function userActor(
  app: TestApp,
  tier: Tier,
): Promise<{ userId: string; auth: Record<string, string> }> {
  const identifier = uniqueEmail(tier.toLowerCase());
  const { body } = await app
    .http()
    .post('/v1/auth/sign-up')
    .send({
      identifier,
      password: 'user password for tests',
      firstName: 'Test',
      lastName: tier,
      wilayaCode: 16,
      acceptTerms: true,
      termsVersion: TEST_TERMS_VERSION,
    })
    .expect(202);
  const tokens = await app
    .http()
    .post('/v1/auth/sign-up/confirm')
    .send({
      challengeId: body.challengeId,
      code: app.lastCode(identifier),
      device: { id: `device-${randomUUID()}`, platform: 'ANDROID' },
    })
    .expect(200);
  const auth = { Authorization: `Bearer ${tokens.body.accessToken}` };
  const userId = (await app.prisma().user.findUniqueOrThrow({ where: { email: identifier } })).id;
  const prisma = app.prisma();

  if (tier === 'STUDENT') {
    await app
      .http()
      .post('/v1/me/professional-profile')
      .set(auth)
      .send({ professionalType: 'STUDENT', academicYear: 4 })
      .expect(200);
    await prisma.verificationCase.create({
      data: {
        userId,
        type: 'STUDENT_STATUS',
        status: 'VERIFIED',
        submittedAt: new Date(),
        decidedAt: new Date(),
      },
    });
    return { userId, auth };
  }

  await app
    .http()
    .post('/v1/me/professional-profile')
    .set(auth)
    .send({ professionalType: 'DOCTOR' })
    .expect(200);
  await prisma.verificationCase.create({
    data: {
      userId,
      type: 'PROFESSIONAL_STATUS',
      status: 'VERIFIED',
      submittedAt: new Date(),
      decidedAt: new Date(),
    },
  });
  if (tier === 'PROFESSIONAL') {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: `TEST_${randomUUID().slice(0, 8)}`,
        version: 1,
        audience: ['DOCTOR', 'RESIDENT'],
        nameFr: 'Test',
        nameEn: 'Test',
        priceMinor: 100000,
        durationDays: 30,
        includesFr: [],
        includesEn: [],
        excludesFr: [],
        excludesEn: [],
      },
    });
    await prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  }
  return { userId, auth };
}

export async function demoActor(app: TestApp): Promise<{ auth: Record<string, string> }> {
  const demo = await app
    .http()
    .post('/v1/demo/sessions')
    .send({ demoContext: 'DOCTOR', deviceId: `demo-${randomUUID()}` })
    .expect(201);
  return { auth: { Authorization: `Bearer ${demo.body.accessToken}` } };
}
