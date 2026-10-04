import { Injectable } from '@nestjs/common';
import { PaymentProvider as PaymentProviders } from '../../generated/prisma/enums.js';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import {
  type ExpenseCategory,
  type OperatingExpense,
  type PaymentProvider,
  Prisma,
  type TransactionAdjustment,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { MessageLocale } from '../../infrastructure/messaging/server-messages.js';
import { ServerMessages } from '../../infrastructure/messaging/server-messages.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { BillingLedgerService, type RevenueRow } from '../billing/index.js';
import {
  type AdjustmentReason,
  type Bucket,
  bucketFor,
  bucketStart,
  bucketStarts,
  CURRENCY,
  csvDocument,
  decimal,
  type FeeRate,
  feeOf,
  type Ledger,
  ledgerOf,
  MAX_PERIOD_DAYS,
  nextBucket,
  type Period,
  previousPeriod,
} from './finance.policy.js';

/** Every payment channel (ADR-021): a fee rate is set per gateway × card. */
const PROVIDERS = Object.values(PaymentProviders);
/** A checkout pending longer than this is an incident on the overview. */
const STALE_PENDING_MINUTES = 60;

export type ExpenseWithActors = OperatingExpense & {
  createdBy: { id: string; fullName: string };
  voidedBy: { id: string; fullName: string } | null;
};

export type AdjustmentWithActors = TransactionAdjustment & {
  requestedBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
};

export interface SeriesPoint {
  start: Date;
  /** The bucket is not over yet (« période en cours »). */
  partial: boolean;
  grossMinor: number;
  byPlan: Record<string, number>;
  started: number;
  renewed: number;
  ended: number;
}

export interface FinanceOverview {
  period: Period;
  previous: Period;
  currency: string;
  bucket: Bucket;
  ledger: Ledger;
  previousLedger: Ledger;
  /** Providers without a fee rate: their estimated fees are unknown. */
  feeRatesMissing: PaymentProvider[];
  subscriptions: {
    mrrMinor: number;
    arrMinor: number;
    payingProfessionals: number;
    started: number;
    renewed: number;
    ended: number;
    previousStarted: number;
    previousRenewed: number;
    previousEnded: number;
  };
  revenueByPlan: { planCode: string; grossMinor: number; payments: number }[];
  series: SeriesPoint[];
  incidents: { failedPayments: number; stalePendingPayments: number };
}

export type ReportKind = 'revenue-by-plan' | 'subscriptions' | 'provider-fees';

/**
 * Revenue aggregates, operating expenses, fee estimates and settlement, exceptional adjustments
 * and reports (section 15, ADR-005). Transactions stay billing's; finance only reads them, except
 * for the fee settlement billing performs on its behalf.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: BillingLedgerService,
    private readonly audit: AuditService,
    private readonly messages: ServerMessages,
  ) {}

  // ─────────────────────────────── periods ───────────────────────────────

  assertPeriod(period: Period): void {
    const days = (period.to.getTime() - period.from.getTime()) / 86_400_000;
    if (!(days > 0) || days > MAX_PERIOD_DAYS) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `The period must last 1 to ${MAX_PERIOD_DAYS} days.`,
        {
          fields: { to: [`1 to ${MAX_PERIOD_DAYS} days after from`] },
        },
      );
    }
  }

  // ─────────────────────────────── fee rates ───────────────────────────────

  async feeRates(): Promise<Map<PaymentProvider, FeeRate>> {
    const rows = await this.prisma.paymentFeeRate.findMany();
    return new Map(
      rows.map((row) => [row.provider, { rateBps: row.rateBps, fixedMinor: row.fixedMinor }]),
    );
  }

  async feeRateRows() {
    const rows = await this.prisma.paymentFeeRate.findMany({
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
    return PROVIDERS.map((provider) => ({
      provider,
      rate: rows.find((row) => row.provider === provider) ?? null,
    }));
  }

  async setFeeRate(
    admin: AdminPrincipal,
    provider: PaymentProvider,
    rate: FeeRate,
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    const before = await this.prisma.paymentFeeRate.findUnique({ where: { provider } });
    await this.prisma.paymentFeeRate.upsert({
      where: { provider },
      create: { provider, ...rate, updatedById: admin.adminId },
      update: { ...rate, updatedById: admin.adminId },
    });
    await this.record(admin, client, 'finance.fee_rate.updated', 'PaymentFeeRate', provider, {
      before: before ? { rateBps: before.rateBps, fixedMinor: before.fixedMinor } : undefined,
      after: { ...rate },
      reason,
    });
  }

  // ─────────────────────────────── expenses ───────────────────────────────

  expenses(period: Period): Promise<ExpenseWithActors[]> {
    return this.prisma.operatingExpense.findMany({
      where: { incurredOn: { gte: period.from, lt: period.to } },
      orderBy: [{ incurredOn: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, fullName: true } },
        voidedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async addExpense(
    admin: AdminPrincipal,
    input: {
      category: ExpenseCategory;
      label: string;
      amountMinor: number;
      incurredOn: Date;
      reason: string;
    },
    client: ClientInfo,
  ): Promise<ExpenseWithActors> {
    const created = await this.prisma.operatingExpense.create({
      data: {
        category: input.category,
        label: input.label.trim(),
        amountMinor: input.amountMinor,
        currency: CURRENCY,
        incurredOn: input.incurredOn,
        createdById: admin.adminId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        voidedBy: { select: { id: true, fullName: true } },
      },
    });
    await this.record(admin, client, 'finance.expense.created', 'OperatingExpense', created.id, {
      after: {
        category: created.category,
        label: created.label,
        amountMinor: created.amountMinor,
        incurredOn: created.incurredOn.toISOString().slice(0, 10),
      },
      reason: input.reason,
    });
    return created;
  }

  async voidExpense(
    admin: AdminPrincipal,
    id: string,
    reason: string,
    client: ClientInfo,
  ): Promise<ExpenseWithActors> {
    const { count } = await this.prisma.operatingExpense.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: admin.adminId, voidReason: reason.trim() },
    });
    if (count !== 1) {
      const exists = await this.prisma.operatingExpense.count({ where: { id } });
      throw exists
        ? new DomainError('INVALID_STATE', 'This expense is already voided.')
        : new DomainError('NOT_FOUND', 'Expense not found.');
    }
    await this.record(admin, client, 'finance.expense.voided', 'OperatingExpense', id, { reason });
    return this.prisma.operatingExpense.findUniqueOrThrow({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        voidedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  // ─────────────────────────────── fee settlement ───────────────────────────────

  async settleFees(
    admin: AdminPrincipal,
    items: { transactionId: string; feesMinor: number }[],
    reason: string,
    client: ClientInfo,
  ) {
    const results = await this.ledger.settleFees(items);
    const settled = results.filter((result) => result.outcome === 'SETTLED');
    if (settled.length > 0) {
      await this.record(admin, client, 'finance.fees.settled', 'Transaction', null, {
        after: settled.map((result) => ({
          transactionId: result.transactionId,
          feesMinor: items.find((item) => item.transactionId === result.transactionId)!.feesMinor,
          previousFeesMinor: result.before,
        })),
        reason,
      });
    }
    return results;
  }

  // ─────────────────────────────── adjustments ───────────────────────────────

  adjustmentsOf(transactionId: string): Promise<AdjustmentWithActors[]> {
    return this.prisma.transactionAdjustment.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'asc' },
      include: {
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  /**
   * « Ajustement exceptionnel… » (section 15): a Super Admin records it; it counts only once a
   * second admin approves. A reversal is negative and never exceeds what is left of the payment.
   */
  async requestAdjustment(
    admin: AdminPrincipal,
    transactionId: string,
    input: {
      kind: 'REVERSAL' | 'CORRECTION';
      amountMinor: number;
      reasonCode: AdjustmentReason;
      note: string;
    },
    client: ClientInfo,
  ): Promise<AdjustmentWithActors> {
    const transaction = await this.ledger.transaction(transactionId);
    if (!transaction) throw new DomainError('NOT_FOUND', 'Transaction not found.');
    if (transaction.status !== 'SUCCEEDED') {
      throw new DomainError('INVALID_STATE', 'Only a succeeded payment can be adjusted.');
    }
    if (input.amountMinor === 0) {
      throw new DomainError('VALIDATION_FAILED', 'The amount cannot be zero.', {
        fields: { amountMinor: ['must not be zero'] },
      });
    }
    if (input.kind === 'REVERSAL') {
      if (input.amountMinor > 0) {
        throw new DomainError('VALIDATION_FAILED', 'A reversal is a negative amount.', {
          fields: { amountMinor: ['must be negative for a reversal'] },
        });
      }
      const existing = await this.prisma.transactionAdjustment.findMany({
        where: { transactionId, kind: 'REVERSAL' },
        select: { amountMinor: true },
      });
      const reversed = existing.reduce((total, row) => total + row.amountMinor, 0);
      if (transaction.amountMinor + reversed + input.amountMinor < 0) {
        throw new DomainError('VALIDATION_FAILED', 'The reversals would exceed the payment.', {
          fields: { amountMinor: ['exceeds what is left of the payment'] },
        });
      }
    }
    const created = await this.prisma.transactionAdjustment.create({
      data: {
        transactionId,
        kind: input.kind,
        amountMinor: input.amountMinor,
        reasonCode: input.reasonCode,
        reasonNote: input.note.trim(),
        requestedById: admin.adminId,
      },
      include: {
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    await this.record(admin, client, 'finance.adjustment.requested', 'Transaction', transactionId, {
      after: {
        adjustmentId: created.id,
        kind: created.kind,
        amountMinor: created.amountMinor,
        reasonCode: created.reasonCode,
      },
      reason: input.note,
    });
    return created;
  }

  async approveAdjustment(
    admin: AdminPrincipal,
    adjustmentId: string,
    reason: string,
    client: ClientInfo,
  ): Promise<AdjustmentWithActors> {
    const adjustment = await this.prisma.transactionAdjustment.findUnique({
      where: { id: adjustmentId },
    });
    if (!adjustment) throw new DomainError('NOT_FOUND', 'Adjustment not found.');
    if (adjustment.approvedById)
      throw new DomainError('INVALID_STATE', 'This adjustment is already approved.');
    if (adjustment.requestedById === admin.adminId) {
      throw new DomainError('FORBIDDEN', 'A second admin must approve an adjustment (four eyes).');
    }
    const { count } = await this.prisma.transactionAdjustment.updateMany({
      where: { id: adjustmentId, approvedById: null },
      data: { approvedById: admin.adminId, approvedAt: new Date() },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'This adjustment is already approved.');
    await this.record(
      admin,
      client,
      'finance.adjustment.approved',
      'Transaction',
      adjustment.transactionId,
      {
        after: { adjustmentId, amountMinor: adjustment.amountMinor },
        reason,
      },
    );
    return this.prisma.transactionAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
      include: {
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  // ─────────────────────────────── overview ───────────────────────────────

  async overview(period: Period, now = new Date()): Promise<FinanceOverview> {
    this.assertPeriod(period);
    const previous = previousPeriod(period);
    const bucket = bucketFor(period);
    const rates = await this.feeRates();
    const [current, before] = await Promise.all([
      this.periodData(period, rates),
      this.periodData(previous, rates),
    ]);
    const at = period.to < now ? period.to : now;
    const metrics = await this.ledger.subscriptionMetrics(at, period.from, period.to);
    const previousMetrics = await this.ledger.subscriptionMetrics(
      previous.to,
      previous.from,
      previous.to,
    );
    const endedDates = await this.ledger.endedBetween(period.from, period.to);
    const incidents = await this.ledger.paymentIncidents(
      period.from,
      period.to,
      new Date(now.getTime() - STALE_PENDING_MINUTES * 60_000),
    );

    const byPlan = new Map<string, { grossMinor: number; payments: number }>();
    for (const row of current.revenue) {
      const entry = byPlan.get(row.plan.code) ?? { grossMinor: 0, payments: 0 };
      entry.grossMinor += row.amountMinor;
      entry.payments += 1;
      byPlan.set(row.plan.code, entry);
    }

    const series = bucketStarts(period, bucket).map((start): SeriesPoint => {
      const end = nextBucket(start, bucket);
      const inBucket = current.revenue.filter(
        (row) => row.paymentDate >= start && row.paymentDate < end,
      );
      const points: Record<string, number> = {};
      for (const row of inBucket)
        points[row.plan.code] = (points[row.plan.code] ?? 0) + row.amountMinor;
      return {
        start,
        partial: end > now,
        grossMinor: inBucket.reduce((total, row) => total + row.amountMinor, 0),
        byPlan: points,
        started: inBucket.filter((row) => row.firstOfSubscription).length,
        renewed: inBucket.filter((row) => !row.firstOfSubscription).length,
        ended: endedDates.filter((date) => bucketStart(date, bucket).getTime() === start.getTime())
          .length,
      };
    });

    const missing = new Set<PaymentProvider>();
    for (const row of current.revenue)
      if (feeOf(row, rates).rateMissing) missing.add(row.paymentProvider);

    return {
      period,
      previous,
      currency: CURRENCY,
      bucket,
      ledger: current.ledger,
      previousLedger: before.ledger,
      feeRatesMissing: [...missing],
      subscriptions: {
        mrrMinor: metrics.mrrMinor,
        arrMinor: metrics.mrrMinor * 12,
        payingProfessionals: metrics.payingProfessionals,
        started: current.revenue.filter((row) => row.firstOfSubscription).length,
        renewed: current.revenue.filter((row) => !row.firstOfSubscription).length,
        ended: metrics.ended,
        previousStarted: before.revenue.filter((row) => row.firstOfSubscription).length,
        previousRenewed: before.revenue.filter((row) => !row.firstOfSubscription).length,
        previousEnded: previousMetrics.ended,
      },
      revenueByPlan: [...byPlan.entries()]
        .map(([planCode, entry]) => ({ planCode, ...entry }))
        .sort((a, b) => b.grossMinor - a.grossMinor),
      series,
      incidents: { failedPayments: incidents.failed, stalePendingPayments: incidents.stalePending },
    };
  }

  /** Net revenue of the last 30 days (overview ledger strip). */
  async netRevenueSince(from: Date, to: Date): Promise<number> {
    const data = await this.periodData({ from, to }, await this.feeRates());
    return data.ledger.netRevenueMinor;
  }

  // ─────────────────────────────── reports ───────────────────────────────

  /** CSV reports with the metric definitions on top (section 15). */
  async report(
    kind: ReportKind,
    period: Period,
    locale: MessageLocale,
    admin: AdminPrincipal,
    client: ClientInfo,
  ) {
    this.assertPeriod(period);
    const rates = await this.feeRates();
    const { revenue } = await this.periodData(period, rates);
    const t = (key: string, values?: Record<string, string | number>) =>
      this.messages.format(locale, `server.finance.${key}`, values);
    const definitions = [
      t('reportPeriod', {
        from: period.from.toISOString().slice(0, 10),
        to: new Date(period.to.getTime() - 1).toISOString().slice(0, 10),
      }),
      t('definitionGross'),
      t('definitionFees'),
      t('definitionNet'),
      t('definitionCurrency', { currency: CURRENCY }),
    ];
    const month = (date: Date) => date.toISOString().slice(0, 7);

    let csv: string;
    if (kind === 'revenue-by-plan') {
      const groups = new Map<string, RevenueRow[]>();
      for (const row of revenue) {
        const key = `${month(row.paymentDate)}|${row.plan.code}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      csv = csvDocument(
        definitions,
        [
          t('colMonth'),
          t('colPlan'),
          t('colPayments'),
          t('colGross'),
          t('colFees'),
          t('colFeesEstimated'),
          t('colNet'),
        ],
        [...groups.entries()].sort().map(([key, rows]) => {
          const [monthKey, plan] = key.split('|') as [string, string];
          const ledger = ledgerOf({ revenue: rows, rates, adjustments: [], expenses: [] });
          return [
            monthKey,
            plan,
            rows.length,
            decimal(ledger.grossMinor),
            decimal(ledger.feesMinor),
            decimal(ledger.estimatedFeesMinor),
            decimal(ledger.netRevenueMinor),
          ];
        }),
      );
    } else if (kind === 'provider-fees') {
      const groups = new Map<string, RevenueRow[]>();
      for (const row of revenue) {
        const key = `${month(row.paymentDate)}|${row.paymentProvider}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      csv = csvDocument(
        definitions,
        [
          t('colMonth'),
          t('colProvider'),
          t('colPayments'),
          t('colGross'),
          t('colFeesActual'),
          t('colFeesEstimated'),
        ],
        [...groups.entries()].sort().map(([key, rows]) => {
          const [monthKey, provider] = key.split('|') as [string, string];
          const settled = rows.reduce((total, row) => total + (row.paymentFeesMinor ?? 0), 0);
          const estimated = ledgerOf({
            revenue: rows.filter((row) => row.paymentFeesMinor === null),
            rates,
            adjustments: [],
            expenses: [],
          }).feesMinor;
          return [
            monthKey,
            provider,
            rows.length,
            decimal(rows.reduce((total, row) => total + row.amountMinor, 0)),
            decimal(settled),
            decimal(estimated),
          ];
        }),
      );
    } else {
      const plans = new Map<string, { started: number; renewed: number; grossMinor: number }>();
      for (const row of revenue) {
        const entry = plans.get(row.plan.code) ?? { started: 0, renewed: 0, grossMinor: 0 };
        if (row.firstOfSubscription) entry.started += 1;
        else entry.renewed += 1;
        entry.grossMinor += row.amountMinor;
        plans.set(row.plan.code, entry);
      }
      const metrics = await this.ledger.subscriptionMetrics(period.to, period.from, period.to);
      csv = csvDocument(
        [...definitions, t('definitionMrr'), t('definitionEnded', { ended: metrics.ended })],
        [t('colPlan'), t('colStarted'), t('colRenewed'), t('colGross')],
        [...plans.entries()]
          .sort()
          .map(([plan, entry]) => [plan, entry.started, entry.renewed, decimal(entry.grossMinor)]),
      );
    }
    await this.record(admin, client, 'finance.report.exported', 'FinanceReport', kind, {
      after: { from: period.from.toISOString(), to: period.to.toISOString(), locale },
    });
    return csv;
  }

  // ─────────────────────────────── helpers ───────────────────────────────

  private async periodData(period: Period, rates: Map<PaymentProvider, FeeRate>) {
    const [revenue, adjustments, expenses] = await Promise.all([
      this.ledger.revenue(period.from, period.to),
      this.prisma.transactionAdjustment.findMany({
        where: { approvedAt: { gte: period.from, lt: period.to } },
        select: { amountMinor: true },
      }),
      this.prisma.operatingExpense.findMany({
        where: { incurredOn: { gte: period.from, lt: period.to }, voidedAt: null },
        select: { amountMinor: true },
      }),
    ]);
    return { revenue, ledger: ledgerOf({ revenue, rates, adjustments, expenses }) };
  }

  private record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    entityType: string,
    entityId: string | null,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue; reason?: string },
  ): Promise<void> {
    return this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action,
      entityType,
      entityId,
      ...change,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
