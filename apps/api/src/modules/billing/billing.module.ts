import { Module } from '@nestjs/common';

/**
 * Plans, subscriptions, checkout, payment-provider webhooks and transactions (ADR-005).
 *
 * Owns: `subscription_plans`, `subscriptions`, `transactions`.
 * Built in Phase 14 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class BillingModule {}
