import { Module } from '@nestjs/common';
import { AccessModule } from '../access/index.js';
import { ActivityModule } from '../activity/index.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AnalyticsModule } from '../analytics/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/index.js';
import { BillingModule } from '../billing/index.js';
import { CalculatorsModule } from '../calculators/index.js';
import { FinanceModule } from '../finance/index.js';
import { ReferenceLibraryModule } from '../reference-library/index.js';
import { UsersModule } from '../users/index.js';
import { VerificationModule } from '../verification/index.js';
import { AdminReadService } from './admin-read.service.js';
import {
  AdminUsersController,
  AuditLogController,
  OverviewController,
} from './admin.controllers.js';

/**
 * Admin-facing read models behind /admin/v1 that span several modules: overview, users, audit
 * log (section 07).
 *
 * Owns no table.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [
    AccessModule,
    ActivityModule,
    AdminAuthModule,
    AnalyticsModule,
    AuditModule,
    AuthModule,
    BillingModule,
    CalculatorsModule,
    FinanceModule,
    ReferenceLibraryModule,
    UsersModule,
    VerificationModule,
  ],
  controllers: [OverviewController, AdminUsersController, AuditLogController],
  providers: [AdminReadService],
})
export class AdminModule {}
