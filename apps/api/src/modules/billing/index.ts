// Public entry point of the billing module (ADR-001). Other modules import from here only.
export { BillingModule } from './billing.module.js';
export {
  SubscriptionStatusService,
  type SubscriptionSnapshot,
} from './subscription-status.service.js';
export {
  accessEnd,
  BillingLedgerService,
  type FeeSettlementOutcome,
  type LedgerSubscription,
  type LedgerTransaction,
  planMonths,
  type RevenueRow,
  type SubscriptionFilter,
  type SubscriptionMetrics,
  type TransactionFilter,
} from './billing-ledger.service.js';
export {
  AdminSubscriptionDto,
  LedgerPersonDto,
  LedgerPlanDto,
  LedgerTransactionRefDto,
  planRef,
} from './billing-ledger.controller.js';
