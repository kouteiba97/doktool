import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { ActivityModule } from '../activity/index.js';
import { AuditModule } from '../audit/index.js';
import { BillingModule } from '../billing/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { UsersModule } from '../users/index.js';
import { VerificationModule } from '../verification/index.js';
import { AccountDeletionService } from './account-deletion.service.js';
import {
  AccountDeletionController,
  AuthController,
  SessionsController,
} from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * User authentication: sign-up, OTP confirmation, sign-in, access/refresh token rotation, device
 * sessions and password reset (ADR-009), and account deletion, which asks each owning module to
 * erase the person's data.
 *
 * Owns: `user_sessions`, `refresh_tokens`, `otp_challenges`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [
    UsersModule,
    ActivityModule,
    AuditModule,
    BillingModule,
    NotificationsModule,
    VerificationModule,
  ],
  controllers: [AuthController, SessionsController, AccountDeletionController],
  providers: [AuthService, OtpService, SessionsService, AccountDeletionService],
  exports: [SessionsService],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('auth.purge-expired', '11 * * * *', async () => {
      await this.otp.purgeExpired();
      await this.sessions.purge();
    });
  }
}
