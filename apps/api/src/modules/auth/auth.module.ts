import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { ActivityModule } from '../activity/index.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { BillingModule } from '../billing/index.js';
import { DemoModule } from '../demo/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { PregnancyModule } from '../pregnancy/index.js';
import { StorageModule } from '../storage/index.js';
import { UsersModule } from '../users/index.js';
import { VerificationModule } from '../verification/index.js';
import {
  AccountRecoveryAdminController,
  AccountRecoveryController,
  AccountSecurityController,
} from './account.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountRecoveryService } from './account-recovery.service.js';
import { AccountSecurityService } from './account-security.service.js';
import {
  AccountDeletionController,
  AuthController,
  SessionsController,
} from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { SecurityNoticesService } from './security-notices.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * User authentication: sign-up, OTP confirmation, sign-in, access/refresh token rotation, device
 * sessions and password reset (ADR-009); contacts, password change, security notices and assisted
 * account recovery (ADR-023); and account deletion, which asks each owning module to erase the
 * person's data.
 *
 * Owns: `user_sessions`, `refresh_tokens`, `otp_challenges`, `account_recovery_requests`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [
    UsersModule,
    ActivityModule,
    AdminAuthModule,
    StorageModule,
    AuditModule,
    BillingModule,
    DemoModule,
    NotificationsModule,
    PregnancyModule,
    VerificationModule,
  ],
  controllers: [
    AuthController,
    SessionsController,
    AccountDeletionController,
    AccountSecurityController,
    AccountRecoveryController,
    AccountRecoveryAdminController,
  ],
  providers: [
    AuthService,
    OtpService,
    SessionsService,
    AccountDeletionService,
    SecurityNoticesService,
    AccountSecurityService,
    AccountRecoveryService,
  ],
  exports: [SessionsService],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
    private readonly recovery: AccountRecoveryService,
  ) {}

  /**
   * Schedules the hourly purge of codes and sessions, and the 10-minute recovery job (apply due
   * approvals, expire and clean up).
   */
  onModuleInit(): void {
    this.jobs.register('auth.purge-expired', '11 * * * *', async () => {
      await this.otp.purgeExpired();
      await this.sessions.purge();
    });
    this.jobs.register('auth.account-recovery', '*/10 * * * *', async () => {
      await this.recovery.applyDue();
      await this.recovery.maintain();
    });
  }
}
