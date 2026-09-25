import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { AuditModule } from '../audit/index.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminBoundaryGuard, AdminSessionGuard } from './admin-guards.js';

/**
 * Admin authentication: separate issuer, cookie sessions, mandatory TOTP, admin accounts and
 * grants (ADR-009).
 *
 * Owns: `admin_accounts`, `admin_grants`, `admin_sessions`, `admin_auth_challenges`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AuditModule],
  controllers: [AdminAuthController],
  providers: [AdminAccountsService, AdminAuthService, AdminBoundaryGuard, AdminSessionGuard],
  exports: [AdminAccountsService, AdminAuthService, AdminBoundaryGuard, AdminSessionGuard],
})
export class AdminAuthModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly auth: AdminAuthService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('admin-auth.purge-expired', '13 * * * *', async () => {
      await this.auth.purge();
    });
  }
}
