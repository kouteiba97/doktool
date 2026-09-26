// Phase 17 exit criterion (finance): Gross → Fees → Net revenue, Net → Expenses → Net profit, fees
// estimated until settled, exceptional adjustments only with a second admin, and no refund anywhere.
import { randomInt, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AdminActor, adminActor, userActor } from './actors.js';
import { useTestApp } from './app.js';

const app = useTestApp();
let superAdmin: AdminActor;
let secondSuperAdmin: AdminActor;
let financeAdmin: AdminActor;

/** A month of a past year no other test writes to. */
const year = 1981 + randomInt(0, 17);
const window = { from: new Date(Date.UTC(year, 2, 1)), to: new Date(Date.UTC(year, 3, 1)) };
const query = (period: { from: Date; to: Date }) =>
  `from=${period.from.toISOString()}&to=${period.to.toISOString()}`;

let planId: string;
let planCode: string;
let userId: string;

beforeAll(async () => {
  superAdmin = await adminActor(app);
  secondSuperAdmin = await adminActor(app);
  financeAdmin = await adminActor(app, 'FINANCE_ADMIN');
  userId = (await userActor(app, 'PROFESSIONAL_UNPAID')).userId;
  planCode = `FIN_${randomUUID().slice(0, 6).toUpperCase().replace(/-/g, '')}`;
  planId = (
    await app.prisma().subscriptionPlan.create({
      data: {
        code: planCode,
        version: 1,
        audience: ['DOCTOR', 'RESIDENT'],
        nameFr: 'Pro mensuel',
        nameEn: 'Pro monthly',
        priceMinor: 150_000,
        durationDays: 30,
        includesFr: [],
        includesEn: [],
        excludesFr: [],
        excludesEn: [],
      },
    })
  ).id;
});

/** A succeeded payment on `day` of the window (rows are written as billing would). */
async function payment(day: number, provider: 'SATIM_CIB' | 'SATIM_EDAHABIA' = 'SATIM_CIB') {
  const paidAt = new Date(window.from.getTime() + day * 86_400_000 + 3_600_000);
  const subscription = await app.prisma().subscription.create({
    data: {
      userId,
      planId,
      status: 'EXPIRED',
      currentPeriodStart: paidAt,
      currentPeriodEnd: new Date(paidAt.getTime() + 30 * 86_400_000),
    },
  });
  return app.prisma().transaction.create({
    data: {
      transactionId: `DT-${year}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`,
      userId,
      subscriptionId: subscription.id,
      planId,
      amountMinor: 150_000,
      currency: 'DZD',
      paymentProvider: provider,
      providerReference: `test-${randomUUID()}`,
      status: 'SUCCEEDED',
      paymentDate: paidAt,
    },
  });
}

const overview = async (period = window) =>
  (await financeAdmin.get(`/admin/v1/finance/overview?${query(period)}`).expect(200)).body;

describe('finance ledger', () => {
  it('estimates fees until settlement and keeps revenue, fees, expenses and profit apart', async () => {
    await superAdmin
      .put('/admin/v1/finance/fee-rates/SATIM_CIB')
      .send({ rateBps: 150, fixedMinor: 1_000, reason: 'SATIM tariff 2026' })
      .expect(204);
    const first = await payment(3);
    await payment(10);

    let figures = await overview();
    // 1.5 % of 150 000 + 10 DZD = 3 250 centimes per payment, still estimated
    expect(figures.ledger).toMatchObject({
      grossMinor: 300_000,
      feesMinor: 6_500,
      estimatedFeesMinor: 6_500,
      netRevenueMinor: 293_500,
      expensesMinor: 0,
      netProfitMinor: 293_500,
      payments: 2,
    });
    expect(figures.bucket).toBe('DAY');
    expect(figures.series).toHaveLength(31);
    expect(figures.series[3]).toMatchObject({
      grossMinor: 150_000,
      started: 1,
      byPlan: { [planCode]: 150_000 },
    });
    expect(figures.revenueByPlan).toEqual([{ planCode, grossMinor: 300_000, payments: 2 }]);

    const settled = await financeAdmin
      .post('/admin/v1/finance/fee-settlements')
      .send({
        items: [
          { transactionId: first.transactionId, feesMinor: 2_000 },
          { transactionId: `DT-${year}-999999`, feesMinor: 10 },
        ],
        reason: 'SATIM statement',
      })
      .expect(200);
    expect(settled.body.map((item: { outcome: string }) => item.outcome)).toContain('SETTLED');

    const expense = await financeAdmin
      .post('/admin/v1/finance/expenses')
      .send({
        category: 'INFRASTRUCTURE',
        label: 'Hébergement',
        amountMinor: 50_000,
        incurredOn: new Date(window.from.getTime() + 5 * 86_400_000).toISOString().slice(0, 10),
        reason: 'Invoice 2026-09',
      })
      .expect(200);
    figures = await overview();
    expect(figures.ledger).toMatchObject({
      feesMinor: 5_250,
      estimatedFeesMinor: 3_250,
      netRevenueMinor: 294_750,
      expensesMinor: 50_000,
      netProfitMinor: 244_750,
    });

    await financeAdmin
      .post(`/admin/v1/finance/expenses/${expense.body.id}/void`)
      .send({ reason: 'Entered twice' })
      .expect(200);
    const again = await financeAdmin
      .post(`/admin/v1/finance/expenses/${expense.body.id}/void`)
      .send({ reason: 'Entered twice' })
      .expect(409);
    expect(again.body.error.code).toBe('INVALID_STATE');
    expect((await overview()).ledger.expensesMinor).toBe(0);
    const listed = await financeAdmin
      .get(`/admin/v1/finance/expenses?${query(window)}`)
      .expect(200);
    expect(listed.body[0]).toMatchObject({ label: 'Hébergement', voidReason: 'Entered twice' });
  });

  it('lists and details transactions with their fee status and history', async () => {
    const paid = await payment(20, 'SATIM_EDAHABIA');
    const found = await financeAdmin
      .get(`/admin/v1/transactions?search=${paid.transactionId}`)
      .expect(200);
    expect(found.body).toHaveLength(1);
    expect(found.body[0]).toMatchObject({
      transactionId: paid.transactionId,
      plan: { code: planCode },
      fees: { estimated: true },
    });
    const detail = await financeAdmin.get(`/admin/v1/transactions/${paid.id}`).expect(200);
    expect(detail.body).toMatchObject({ adjustments: [], status: 'SUCCEEDED' });
  });

  it('counts an exceptional adjustment only once a second Super Admin approves it', async () => {
    const paid = await payment(25);
    const around = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) };
    const before = (await overview(around)).ledger.adjustmentsMinor as number;

    await financeAdmin
      .post(`/admin/v1/transactions/${paid.id}/adjustments`)
      .send({
        kind: 'REVERSAL',
        amountMinor: -150_000,
        reasonCode: 'PROVIDER_ERROR',
        note: 'Charged twice',
      })
      .expect(403);
    await superAdmin
      .post(`/admin/v1/transactions/${paid.id}/adjustments`)
      .send({
        kind: 'REVERSAL',
        amountMinor: 150_000,
        reasonCode: 'PROVIDER_ERROR',
        note: 'Positive reversal',
      })
      .expect(400);
    const requested = await superAdmin
      .post(`/admin/v1/transactions/${paid.id}/adjustments`)
      .send({
        kind: 'REVERSAL',
        amountMinor: -150_000,
        reasonCode: 'PROVIDER_ERROR',
        note: 'Charged twice',
      })
      .expect(200);
    const adjustment = requested.body.adjustments[0];
    expect(adjustment).toMatchObject({ amountMinor: -150_000, approvedBy: null });
    expect((await overview(around)).ledger.adjustmentsMinor).toBe(before);

    await superAdmin
      .post(`/admin/v1/transactions/adjustments/${adjustment.id}/approve`)
      .send({ reason: 'Approving my own' })
      .expect(403);
    const approved = await secondSuperAdmin
      .post(`/admin/v1/transactions/adjustments/${adjustment.id}/approve`)
      .send({ reason: 'Checked the SATIM statement' })
      .expect(200);
    expect(approved.body.adjustments[0].approvedBy.id).toBe(secondSuperAdmin.id);
    expect((await overview(around)).ledger.adjustmentsMinor).toBe(before - 150_000);

    const beyond = await superAdmin
      .post(`/admin/v1/transactions/${paid.id}/adjustments`)
      .send({ kind: 'REVERSAL', amountMinor: -1, reasonCode: 'OTHER', note: 'Nothing left' })
      .expect(400);
    expect(beyond.body.error.code).toBe('VALIDATION_FAILED');
    const history = await superAdmin.get(`/admin/v1/transactions/${paid.id}`).expect(200);
    expect(history.body.history.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining(['finance.adjustment.requested', 'finance.adjustment.approved']),
    );
  });

  it('exports CSV reports with their definitions and keeps finance behind its grants', async () => {
    const report = await financeAdmin
      .get(`/admin/v1/finance/reports/revenue-by-plan?${query(window)}&locale=EN`)
      .expect(200);
    expect(report.headers['content-type']).toContain('text/csv');
    expect(report.text).toContain('# Gross revenue:');
    expect(report.text).toContain(planCode);

    const librarian = await adminActor(app, 'LIBRARY_MANAGER');
    await librarian.get(`/admin/v1/finance/overview?${query(window)}`).expect(403);
    await librarian.get('/admin/v1/transactions').expect(403);
    await financeAdmin
      .put('/admin/v1/finance/fee-rates/SATIM_EDAHABIA')
      .send({ rateBps: 20_000, fixedMinor: 0, reason: 'Invalid rate' })
      .expect(400);
    await financeAdmin
      .get(
        `/admin/v1/finance/overview?from=${window.to.toISOString()}&to=${window.from.toISOString()}`,
      )
      .expect(400);
  });
});
