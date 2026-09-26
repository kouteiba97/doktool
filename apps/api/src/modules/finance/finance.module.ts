import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { BillingModule } from '../billing/index.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { TransactionsController } from './transactions.controller.js';

/**
 * Revenue aggregates, operating expenses, fee estimates and settlement, reports and exceptional
 * adjustments (section 15, ADR-005, ADR-017).
 *
 * Owns: `transaction_adjustments`, `operating_expenses`, `payment_fee_rates`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AdminAuthModule, AuditModule, BillingModule],
  controllers: [FinanceController, TransactionsController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
