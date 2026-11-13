import { Injectable } from '@nestjs/common';
import type {
  PaymentProvider,
  Prisma,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  Transaction,
  TransactionStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { UsersService } from '../users/index.js';

const PAGE = 50;

/** Filters of the transactions page. */
export interface TransactionFilter {
  status?: TransactionStatus;
  provider?: PaymentProvider;
  planCode?: string;
  /** Created (or paid, for SUCCEEDED) on or after. */
  from?: Date;
  /** …and before. */
  to?: Date;
  /** Exact public id (DT-…) or provider reference. */
  search?: string;
  userId?: string;
  cursor?: string;
}

/** Filters of the subscriptions page. */
export interface SubscriptionFilter {
  status?: SubscriptionStatus;
  planCode?: string;
  userId?: string;
  cursor?: string;
}

/** The plan fields the ledgers need. */
type PlanRef = Pick<
  SubscriptionPlan,
  'id' | 'code' | 'version' | 'nameFr' | 'nameEn' | 'durationDays' | 'priceMinor' | 'currency'
>;
const PLAN_SELECT = {
  id: true,
  code: true,
  version: true,
  nameFr: true,
  nameEn: true,
  durationDays: true,
  priceMinor: true,
  currency: true,
} satisfies Prisma.SubscriptionPlanSelect;

/** A transaction with its plan and the person's name. */
export type LedgerTransaction = Transaction & {
  plan: PlanRef;
  user: { id: string; firstName: string; lastName: string };
};

/** A subscription with its plan, the person's name and its latest transaction. */
export type LedgerSubscription = Subscription & {
  plan: PlanRef;
  user: { id: string; firstName: string; lastName: string };
  lastTransaction: Pick<
    Transaction,
    'id' | 'transactionId' | 'status' | 'paymentProvider' | 'createdAt'
  > | null;
};

/** A SUCCEEDED payment as revenue sees it. */
export interface RevenueRow {
  id: string;
  transactionId: string;
  userId: string;
  amountMinor: number;
  currency: string;
  paymentFeesMinor: number | null;
  paymentProvider: PaymentProvider;
  paymentDate: Date;
  plan: PlanRef;
  /** The first payment of its subscription (new), or a later one (renewal). */
  firstOfSubscription: boolean;
}

/** Subscription figures for finance and the overview. */
export interface SubscriptionMetrics {
  /** Normalised monthly value of live subscriptions at `at` (an annual plan counts ÷ 12). */
  mrrMinor: number;
  /** Distinct doctors and residents with a live subscription at `at`. */
  payingProfessionals: number;
  liveSubscriptions: number;
  /** Subscriptions whose access ended (after grace, or at the end of a stopped renewal) in the period. */
  ended: number;
}

/** What happened to one line of a fee settlement. */
export type FeeSettlementOutcome = 'SETTLED' | 'NOT_FOUND' | 'NOT_SUCCEEDED' | 'FEES_ABOVE_AMOUNT';

/** Months a plan covers, for MRR: 30 days → 1, 90 → 3, 365 → 12. */
export function planMonths(durationDays: number): number {
  return Math.max(1, Math.round(durationDays / 30.4375));
}

/** When a subscription's access ends: its grace end if it went through grace, else its period end. */
export function accessEnd(
  subscription: Pick<Subscription, 'graceEndsAt' | 'currentPeriodEnd'>,
): Date | null {
  return subscription.graceEndsAt ?? subscription.currentPeriodEnd;
}

/**
 * Read models of billing for finance and Admin Web (transactions, subscriptions, revenue rows,
 * subscription metrics) and the one write finance may ask for: fee settlement (ADR-005).
 */
@Injectable()
export class BillingLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** One page of transactions, newest first. */
  async transactions(filter: TransactionFilter): Promise<LedgerTransaction[]> {
    const search = filter.search?.trim();
    const rows = await this.prisma.transaction.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.provider ? { paymentProvider: filter.provider } : {}),
        ...(filter.planCode ? { plan: { code: filter.planCode } } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.from || filter.to
          ? {
              createdAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lt: filter.to } : {}),
              },
            }
          : {}),
        ...(search
          ? { OR: [{ transactionId: search.toUpperCase() }, { providerReference: search }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: { plan: { select: PLAN_SELECT } },
    });
    return this.withUsers(rows);
  }

  /** One transaction with its plan and person. */
  async transaction(id: string): Promise<LedgerTransaction | null> {
    const row = await this.prisma.transaction.findUnique({
      where: { id },
      include: { plan: { select: PLAN_SELECT } },
    });
    return row ? (await this.withUsers([row]))[0]! : null;
  }

  /** One page of subscriptions, newest first. */
  async subscriptions(filter: SubscriptionFilter): Promise<LedgerSubscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        status: filter.status ?? { not: 'PENDING_PAYMENT' },
        ...(filter.planCode ? { plan: { code: filter.planCode } } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        plan: { select: PLAN_SELECT },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            transactionId: true,
            status: true,
            paymentProvider: true,
            createdAt: true,
          },
        },
      },
    });
    const withUsers = await this.withUsers(rows);
    return withUsers.map(({ transactions, ...row }) => ({
      ...row,
      lastTransaction: transactions[0] ?? null,
    }));
  }

  /** SUCCEEDED payments dated in [from, to). */
  async revenue(from: Date, to: Date): Promise<RevenueRow[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { status: 'SUCCEEDED', paymentDate: { gte: from, lt: to } },
      orderBy: { paymentDate: 'asc' },
      include: { plan: { select: PLAN_SELECT } },
    });
    const subscriptionIds = [...new Set(rows.map((row) => row.subscriptionId))];
    const firsts = await this.prisma.transaction.groupBy({
      by: ['subscriptionId'],
      where: { status: 'SUCCEEDED', subscriptionId: { in: subscriptionIds } },
      _min: { paymentDate: true },
    });
    const firstDate = new Map(
      firsts.map((row) => [row.subscriptionId, row._min.paymentDate?.getTime()]),
    );
    return rows.map((row) => ({
      id: row.id,
      transactionId: row.transactionId,
      userId: row.userId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      paymentFeesMinor: row.paymentFeesMinor,
      paymentProvider: row.paymentProvider,
      paymentDate: row.paymentDate!,
      plan: row.plan,
      firstOfSubscription: firstDate.get(row.subscriptionId) === row.paymentDate!.getTime(),
    }));
  }

  /** MRR and paying professionals at `at`; subscriptions ended in [from, to). */
  async subscriptionMetrics(at: Date, from: Date, to: Date): Promise<SubscriptionMetrics> {
    const candidates = await this.prisma.subscription.findMany({
      where: {
        status: { not: 'PENDING_PAYMENT' },
        currentPeriodStart: { lte: at },
        OR: [{ graceEndsAt: { gt: at } }, { graceEndsAt: null, currentPeriodEnd: { gt: at } }],
      },
      select: { userId: true, plan: { select: { priceMinor: true, durationDays: true } } },
    });
    const ended = await this.prisma.subscription.count({
      where: {
        status: 'EXPIRED',
        OR: [
          { graceEndsAt: { gte: from, lt: to } },
          { graceEndsAt: null, currentPeriodEnd: { gte: from, lt: to } },
        ],
      },
    });
    return {
      mrrMinor: Math.round(
        candidates.reduce(
          (total, subscription) =>
            total + subscription.plan.priceMinor / planMonths(subscription.plan.durationDays),
          0,
        ),
      ),
      payingProfessionals: new Set(candidates.map((subscription) => subscription.userId)).size,
      liveSubscriptions: candidates.length,
      ended,
    };
  }

  /** When each subscription that ended in [from, to) lost its access (for charts by bucket). */
  async endedBetween(from: Date, to: Date): Promise<Date[]> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        status: 'EXPIRED',
        OR: [
          { graceEndsAt: { gte: from, lt: to } },
          { graceEndsAt: null, currentPeriodEnd: { gte: from, lt: to } },
        ],
      },
      select: { graceEndsAt: true, currentPeriodEnd: true },
    });
    return rows.flatMap((row) => {
      const end = accessEnd(row);
      return end ? [end] : [];
    });
  }

  /** Transactions that failed or were abandoned in [from, to), and those still pending now. */
  async paymentIncidents(from: Date, to: Date, pendingSince: Date) {
    const [failed, stalePending] = await Promise.all([
      this.prisma.transaction.count({
        where: { status: 'FAILED', updatedAt: { gte: from, lt: to } },
      }),
      this.prisma.transaction.count({
        where: { status: 'PENDING', createdAt: { lt: pendingSince } },
      }),
    ]);
    return { failed, stalePending };
  }

  /**
   * Replaces estimated fees with the provider's actual fee (the only change a final transaction
   * accepts, enforced by the database). Each item is reported with its outcome.
   */
  async settleFees(
    items: { transactionId: string; feesMinor: number }[],
  ): Promise<{ transactionId: string; outcome: FeeSettlementOutcome; before: number | null }[]> {
    const results: {
      transactionId: string;
      outcome: FeeSettlementOutcome;
      before: number | null;
    }[] = [];
    for (const item of items) {
      const found = await this.prisma.transaction.findUnique({
        where: { transactionId: item.transactionId },
        select: { id: true, status: true, amountMinor: true, paymentFeesMinor: true },
      });
      if (!found) {
        results.push({ transactionId: item.transactionId, outcome: 'NOT_FOUND', before: null });
      } else if (found.status !== 'SUCCEEDED') {
        results.push({ transactionId: item.transactionId, outcome: 'NOT_SUCCEEDED', before: null });
      } else if (item.feesMinor > found.amountMinor) {
        results.push({
          transactionId: item.transactionId,
          outcome: 'FEES_ABOVE_AMOUNT',
          before: found.paymentFeesMinor,
        });
      } else {
        await this.prisma.transaction.update({
          where: { id: found.id },
          data: {
            paymentFeesMinor: item.feesMinor,
            netAmountMinor: found.amountMinor - item.feesMinor,
          },
        });
        results.push({
          transactionId: item.transactionId,
          outcome: 'SETTLED',
          before: found.paymentFeesMinor,
        });
      }
    }
    return results;
  }

  /** Counts for the admin user drawer: the live subscription and the payments of one person. */
  async forUser(userId: string) {
    const [subscriptions, transactions] = await Promise.all([
      this.subscriptions({ userId }),
      this.transactions({ userId }),
    ]);
    return { subscriptions, transactions };
  }

  /** Adds the person's first and last name to each row. */
  private async withUsers<T extends { userId: string }>(
    rows: T[],
  ): Promise<(T & { user: { id: string; firstName: string; lastName: string } })[]> {
    const names = await this.users.names(rows.map((row) => row.userId));
    return rows.map((row) => ({
      ...row,
      user: { id: row.userId, ...(names.get(row.userId) ?? { firstName: '', lastName: '' }) },
    }));
  }
}
