import { Module } from '@nestjs/common';

/**
 * Revenue aggregates, operating expenses, reports and exceptional adjustments (ADR-005).
 *
 * Owns: `transaction_adjustments`.
 * Built in Phase 17 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class FinanceModule {}
