import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { DomainError } from '../../common/errors/domain-error.js';
import type {
  PaymentMethod,
  PaymentProvider,
  Prisma,
  Subscription,
  SubscriptionPlan,
  Transaction,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  ANALYTICS_SERVER_EVENT_JOB,
  type ServerAnalyticsEvent,
} from '../../infrastructure/jobs/analytics-job.js';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { NotificationsService } from '../notifications/index.js';
import { UsersService } from '../users/index.js';
import { VerificationStatusService } from '../verification/index.js';
import {
  ACKNOWLEDGEMENT_VERSION,
  addDays,
  PENDING_CHECKOUT_MINUTES,
  RENEWAL_WINDOW_DAYS,
} from './billing.policy.js';
import { PaymentGateways } from './payments/payment-gateways.js';
import { type OrderOutcome, PaymentProviderError } from './payments/payment-provider.js';
import { PlansService } from './plans.service.js';

export type Eligibility =
  | { state: 'OPEN'; renewal: boolean }
  | { state: 'ACCOUNT_REQUIRED' }
  | { state: 'STUDENT_FREE' }
  | { state: 'ROLE_REQUIRED' }
  | { state: 'VERIFICATION_REQUIRED' }
  | { state: 'VERIFICATION_PENDING' }
  | { state: 'ACCOUNT_SUSPENDED' }
  | { state: 'ACTIVE'; renewableFrom: Date };

export interface CheckoutStarted {
  transactionId: string;
  redirectUrl: string;
}

const LIVE = ['ACTIVE', 'GRACE', 'CANCELED'] as const;

/**
 * Checkout and payment confirmation (ADR-015). Nobody pays before professional verification is
 * VERIFIED (ADR-006 Q6), every payment is confirmed server to server with the provider, and a
 * transaction, once final, is never changed or deleted (ADR-005: no refund workflow exists).
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly gateways: PaymentGateways,
    private readonly users: UsersService,
    private readonly verification: VerificationStatusService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async eligibility(userId: string, now = new Date()): Promise<Eligibility> {
    const facts = await this.users.getAccessFacts(userId);
    if (!facts || facts.status !== 'ACTIVE') return { state: 'ACCOUNT_SUSPENDED' };
    if (facts.professionalType === null) return { state: 'ROLE_REQUIRED' };
    if (facts.professionalType === 'STUDENT') return { state: 'STUDENT_FREE' };
    const status = (await this.verification.snapshot(userId)).PROFESSIONAL_STATUS.status;
    if (status === 'SUBMITTED' || status === 'IN_REVIEW' || status === 'APPEALED') {
      return { state: 'VERIFICATION_PENDING' };
    }
    if (status !== 'VERIFIED') return { state: 'VERIFICATION_REQUIRED' };
    const live = await this.liveSubscription(userId, now);
    if (!live) return { state: 'OPEN', renewal: false };
    const renewableFrom = addDays(live.currentPeriodEnd!, -RENEWAL_WINDOW_DAYS);
    if (live.status === 'ACTIVE' && now < renewableFrom) return { state: 'ACTIVE', renewableFrom };
    return { state: 'OPEN', renewal: true };
  }

  async start(
    userId: string,
    input: { planId: string; method: PaymentMethod; language: 'FR' | 'EN' },
  ): Promise<CheckoutStarted> {
    const eligibility = await this.eligibility(userId);
    if (eligibility.state !== 'OPEN') {
      throw new DomainError('INVALID_STATE', `Checkout is not open (${eligibility.state}).`);
    }
    const facts = (await this.users.getAccessFacts(userId))!;
    const plan = await this.plans.byId(input.planId);
    if (!plan.isPurchasable || !plan.audience.includes(facts.professionalType!)) {
      throw new DomainError('INVALID_STATE', 'This plan is not offered to this account.');
    }
    const gateway = await this.gateways.forMethod(input.method);
    const channel = gateway?.channels[input.method];
    if (!gateway || !channel) {
      throw new DomainError(
        'CHANNEL_UNAVAILABLE',
        'This payment method is not available right now; try the other one or come back later.',
      );
    }

    const pending = await this.prisma.transaction.findFirst({
      where: {
        userId,
        status: 'PENDING',
        createdAt: { gt: new Date(Date.now() - PENDING_CHECKOUT_MINUTES * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      const redirectUrl = metadataOf(pending).redirectUrl;
      if (
        pending.planId === plan.id &&
        pending.paymentProvider === channel &&
        typeof redirectUrl === 'string'
      ) {
        return { transactionId: pending.transactionId, redirectUrl };
      }
      throw new DomainError(
        'INVALID_STATE',
        'A payment is already in progress; finish or wait for it.',
      );
    }

    const subscription = await this.subscriptionFor(userId, plan, eligibility.renewal);
    const transaction = await this.createTransaction(userId, subscription, plan, channel, {
      renewal: eligibility.renewal,
      language: input.language,
    });
    try {
      const order = await gateway.register({
        transactionId: transaction.transactionId,
        orderNumber: orderNumberOf(transaction.transactionId),
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        method: input.method,
        description: `DokTool Pro ${plan.code} ${transaction.transactionId}`,
        language: input.language,
        returnUrl: `${this.publicUrl()}/v1/subscription/checkout/return?transactionId=${transaction.transactionId}`,
        webhookUrl: `${this.publicUrl()}/v1/payments/webhooks/${gateway.id}`,
      });
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          providerReference: order.providerReference,
          metadata: { ...metadataOf(transaction), redirectUrl: order.redirectUrl },
        },
      });
      return { transactionId: transaction.transactionId, redirectUrl: order.redirectUrl };
    } catch (error) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...metadataOf(transaction),
            providerMessage:
              error instanceof PaymentProviderError ? error.providerMessage : 'Provider error',
          },
        },
      });
      if (error instanceof PaymentProviderError) {
        throw new DomainError('CHANNEL_UNAVAILABLE', error.providerMessage);
      }
      throw error;
    }
  }

  /** The person's transaction, confirmed with the provider when still pending. */
  async transaction(userId: string, transactionId: string): Promise<Transaction> {
    const found = await this.prisma.transaction.findUnique({ where: { transactionId } });
    if (!found || found.userId !== userId)
      throw new DomainError('NOT_FOUND', 'Transaction not found.');
    return this.settle(found);
  }

  /** Called by the payment page's return URL: confirms the order, whoever is calling. */
  async settleByPublicId(transactionId: string): Promise<Transaction | null> {
    const found = await this.prisma.transaction.findUnique({ where: { transactionId } });
    return found ? this.settle(found) : null;
  }

  /**
   * Called by a gateway's authenticated webhook: confirms that gateway's order with the gateway
   * itself. Unknown orders (another application on the same merchant account) are ignored.
   */
  async settleByProviderReference(
    gatewayId: string,
    providerReference: string,
  ): Promise<Transaction | null> {
    const gateway = this.gateways.byId(gatewayId);
    if (!gateway) return null;
    const found = await this.prisma.transaction.findFirst({
      where: { providerReference, paymentProvider: { in: Object.values(gateway.channels) } },
    });
    return found ? this.settle(found) : null;
  }

  /**
   * Asks the provider for the outcome of a pending transaction and applies it: activation or
   * extension on payment, failure with the provider's message, or cancellation when abandoned.
   */
  async settle(transaction: Transaction, now = new Date()): Promise<Transaction> {
    if (transaction.status !== 'PENDING' || !transaction.providerReference) {
      if (transaction.status === 'PENDING' && this.abandoned(transaction, now)) {
        return this.finish(transaction, 'CANCELED', {});
      }
      return transaction;
    }
    const gateway = this.gateways.forChannel(transaction.paymentProvider);
    if (!gateway) {
      // Its gateway was removed from the configuration: it can no longer be confirmed here.
      this.logger.warn(
        `${transaction.transactionId}: no configured gateway records ${transaction.paymentProvider}`,
      );
      return this.abandoned(transaction, now)
        ? this.finish(transaction, 'CANCELED', {})
        : transaction;
    }
    let outcome;
    try {
      outcome = await gateway.status(
        transaction.providerReference,
        metadataOf(transaction).language === 'EN' ? 'EN' : 'FR',
      );
    } catch (error) {
      this.logger.warn(`Could not confirm ${transaction.transactionId}: ${String(error)}`);
      return transaction;
    }
    switch (outcome.status) {
      case 'PENDING':
        return this.abandoned(transaction, now)
          ? this.finish(transaction, 'CANCELED', {})
          : transaction;
      case 'FAILED':
        return this.finish(transaction, 'FAILED', {
          providerMessage: outcome.providerMessage,
          provider: outcome.details,
        });
      case 'PAID':
        return this.activate(transaction, outcome);
    }
  }

  /** « Ne pas renouveler »: records the choice; access continues to the period end. */
  async stopRenewal(userId: string): Promise<void> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'CANCELED' },
    });
    if (count === 0)
      throw new DomainError('INVALID_STATE', 'No active subscription to stop renewing.');
  }

  /** The subscription screen: the live subscription (or the latest one) and every payment. */
  async overview(userId: string): Promise<{
    subscription: (Subscription & { plan: SubscriptionPlan }) | null;
    transactions: (Transaction & { plan: SubscriptionPlan })[];
  }> {
    const live = await this.liveSubscription(userId);
    const subscription = await this.prisma.subscription.findFirst({
      where: live ? { id: live.id } : { userId, status: { not: 'PENDING_PAYMENT' } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { plan: true },
    });
    return { subscription, transactions };
  }

  async liveSubscription(userId: string, now = new Date()): Promise<Subscription | null> {
    const candidates = await this.prisma.subscription.findMany({
      where: { userId, status: { in: [...LIVE] } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    return (
      candidates.find((subscription) =>
        subscription.status === 'GRACE'
          ? (subscription.graceEndsAt ?? now) > now
          : (subscription.currentPeriodEnd ?? now) > now || subscription.status === 'ACTIVE',
      ) ?? null
    );
  }

  // ───────────────────────────────── helpers ─────────────────────────────────

  private abandoned(transaction: Transaction, now: Date): boolean {
    return now.getTime() - transaction.createdAt.getTime() > PENDING_CHECKOUT_MINUTES * 60_000;
  }

  private async subscriptionFor(
    userId: string,
    plan: SubscriptionPlan,
    renewal: boolean,
  ): Promise<Subscription> {
    if (renewal) {
      const live = await this.liveSubscription(userId);
      if (live) return live;
    }
    const waiting = await this.prisma.subscription.findFirst({
      where: { userId, status: 'PENDING_PAYMENT' },
      orderBy: { createdAt: 'desc' },
    });
    if (waiting) {
      return this.prisma.subscription.update({
        where: { id: waiting.id },
        data: { planId: plan.id },
      });
    }
    return this.prisma.subscription.create({ data: { userId, planId: plan.id } });
  }

  /** DT-YYYY-NNNNNN, numbered per year under an advisory lock. */
  private async createTransaction(
    userId: string,
    subscription: Subscription,
    plan: SubscriptionPlan,
    provider: PaymentProvider,
    context: { renewal: boolean; language: 'FR' | 'EN' },
  ): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('transactions.public_id'))`;
      const last = await tx.transaction.findFirst({
        where: { transactionId: { startsWith: `DT-${year}-` } },
        orderBy: { transactionId: 'desc' },
        select: { transactionId: true },
      });
      const next = last ? Number(last.transactionId.slice(-6)) + 1 : 1;
      if (next > 999_999) throw new Error(`Transaction numbering exhausted for ${year}`);
      return tx.transaction.create({
        data: {
          transactionId: `DT-${year}-${String(next).padStart(6, '0')}`,
          userId,
          subscriptionId: subscription.id,
          planId: plan.id,
          amountMinor: plan.priceMinor,
          currency: plan.currency,
          paymentProvider: provider,
          metadata: {
            renewal: context.renewal,
            language: context.language,
            acknowledgement: ACKNOWLEDGEMENT_VERSION,
            acknowledgedAt: new Date().toISOString(),
          },
        },
      });
    });
  }

  private async finish(
    transaction: Transaction,
    status: 'FAILED' | 'CANCELED',
    extra: Prisma.InputJsonObject,
  ): Promise<Transaction> {
    const { count } = await this.prisma.transaction.updateMany({
      where: { id: transaction.id, status: 'PENDING' },
      data: { status, metadata: { ...metadataOf(transaction), ...extra } },
    });
    return count === 1
      ? this.prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } })
      : transaction;
  }

  private async activate(
    transaction: Transaction,
    outcome: Extract<OrderOutcome, { status: 'PAID' }>,
  ): Promise<Transaction> {
    const { paidAt, amountMinor: paidAmountMinor, details } = outcome;
    // A fee the gateway reports is the actual fee; a missing or implausible one is estimated later.
    const fees =
      outcome.feesMinor !== undefined &&
      outcome.feesMinor >= 0 &&
      outcome.feesMinor <= transaction.amountMinor
        ? outcome.feesMinor
        : null;
    const plan = await this.plans.byId(transaction.planId);
    // The money is recorded whatever happens; access is granted only for the full price and to
    // an account that still exists (ADR-018). Anything else is left to the Super Admin.
    const deleted = (await this.users.getAccessFacts(transaction.userId))?.status === 'DELETED';
    const shortfall = paidAmountMinor < transaction.amountMinor;
    const withheld = deleted ? 'ACCOUNT_DELETED' : shortfall ? 'AMOUNT_SHORT' : null;
    const settled = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.transaction.updateMany({
        where: { id: transaction.id, status: 'PENDING' },
        data: {
          status: 'SUCCEEDED',
          paymentDate: paidAt,
          ...(fees === null
            ? {}
            : { paymentFeesMinor: fees, netAmountMinor: transaction.amountMinor - fees }),
          metadata: {
            ...metadataOf(transaction),
            provider: details,
            ...(paidAmountMinor !== transaction.amountMinor ? { paidAmountMinor } : {}),
            ...(withheld ? { accessWithheld: withheld } : {}),
          },
        },
      });
      if (count !== 1) return null;
      if (withheld) return { started: false, withheld };
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: transaction.subscriptionId },
      });
      const started = subscription.status === 'PENDING_PAYMENT';
      const start =
        subscription.status === 'PENDING_PAYMENT' || !subscription.currentPeriodEnd
          ? paidAt
          : (subscription.currentPeriodStart ?? paidAt);
      const from =
        subscription.currentPeriodEnd && subscription.currentPeriodEnd > paidAt
          ? subscription.currentPeriodEnd
          : paidAt;
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          planId: plan.id,
          currentPeriodStart: start,
          currentPeriodEnd: addDays(from, plan.durationDays),
          graceEndsAt: null,
        },
      });
      return { started, withheld: null };
    });
    if (settled?.withheld) {
      this.logger.error(
        `${transaction.transactionId}: paid but access withheld (${settled.withheld}); review it in Admin Web`,
      );
    } else if (settled) {
      if (paidAmountMinor !== transaction.amountMinor) {
        this.logger.error(
          `${transaction.transactionId}: provider amount ${paidAmountMinor} differs from ${transaction.amountMinor}`,
        );
      }
      await this.notifications.notify({
        userId: transaction.userId,
        type: 'subscription.activated',
        messageKey: 'mobile.notifications.subscriptionActivated',
        params: { transactionId: transaction.transactionId },
      });
      const event: ServerAnalyticsEvent = {
        type: settled.started ? 'SUBSCRIPTION_STARTED' : 'SUBSCRIPTION_RENEWED',
        userId: transaction.userId,
        occurredAt: paidAt.toISOString(),
        planCode: plan.code,
        planVersion: plan.version,
      };
      await this.jobs.enqueue(ANALYTICS_SERVER_EVENT_JOB, event);
    }
    return this.prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
  }

  private publicUrl(): string {
    return this.env.PUBLIC_API_URL ?? `http://localhost:${this.env.PORT}`;
  }
}

export function metadataOf(transaction: Pick<Transaction, 'metadata'>): Prisma.JsonObject {
  const value = transaction.metadata;
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

/** Short order number (SATIM takes at most 10 characters): DT-2026-000123 → 26000123. */
export function orderNumberOf(transactionId: string): string {
  const [, year, number] = transactionId.split('-');
  return `${year!.slice(-2)}${number}`;
}
