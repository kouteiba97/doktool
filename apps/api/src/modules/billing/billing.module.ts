import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { UsersModule } from '../users/index.js';
import { VerificationModule } from '../verification/index.js';
import {
  BillingAdminController,
  PaymentMethodsAdminController,
} from './billing-admin.controller.js';
import { BillingLedgerController } from './billing-ledger.controller.js';
import { BillingLedgerService } from './billing-ledger.service.js';
import { BillingController } from './billing.controller.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentWebhooksController } from './payment-webhooks.controller.js';
import { ChargilyGateway } from './payments/chargily.gateway.js';
import { FakeGateway } from './payments/fake.gateway.js';
import { PaymentGateways } from './payments/payment-gateways.js';
import { SatimGateway } from './payments/satim.gateway.js';
import { PlansService } from './plans.service.js';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service.js';
import { SubscriptionStatusService } from './subscription-status.service.js';

/**
 * Plans, subscriptions, checkout, payment gateways and confirmation, transactions (ADR-005,
 * ADR-015, ADR-021).
 *
 * Owns: `subscription_plans`, `subscriptions`, `transactions`, `payment_method_settings`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AdminAuthModule, AuditModule, NotificationsModule, UsersModule, VerificationModule],
  controllers: [
    BillingController,
    BillingAdminController,
    BillingLedgerController,
    PaymentMethodsAdminController,
    PaymentWebhooksController,
  ],
  providers: [
    SubscriptionStatusService,
    PlansService,
    CheckoutService,
    SubscriptionLifecycleService,
    BillingLedgerService,
    ChargilyGateway,
    SatimGateway,
    FakeGateway,
    PaymentGateways,
  ],
  exports: [SubscriptionStatusService, CheckoutService, BillingLedgerService],
})
export class BillingModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('billing.advance-subscriptions', '30 2 * * *', async () => {
      await this.lifecycle.advance();
      await this.lifecycle.remind();
    });
    this.jobs.register('billing.reconcile-checkouts', '*/10 * * * *', async () => {
      await this.lifecycle.reconcile();
    });
  }
}
