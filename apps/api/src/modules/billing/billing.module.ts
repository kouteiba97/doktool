import { Module } from '@nestjs/common';
import { SubscriptionStatusService } from './subscription-status.service.js';

/**
 * Plans, subscriptions, checkout, payment-provider webhooks and transactions (ADR-005).
 * Phase 4 provides the read side used by the access policy; checkout arrives in Phase 14.
 *
 * Owns: `subscription_plans`, `subscriptions`, `transactions`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  providers: [SubscriptionStatusService],
  exports: [SubscriptionStatusService],
})
export class BillingModule {}
