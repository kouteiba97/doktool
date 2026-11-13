import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { StorageModule } from '../storage/index.js';
import { UsersModule } from '../users/index.js';
import { VerificationAdminController } from './verification-admin.controller.js';
import { VerificationFilesService } from './verification-files.service.js';
import { VerificationMaintenanceService } from './verification-maintenance.service.js';
import { VerificationReviewService } from './verification-review.service.js';
import { VerificationStatusService } from './verification-status.service.js';
import { VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

/**
 * Identity, professional-status and student-status cases, their documents and decisions
 * (section 06, ADR-013).
 *
 * Owns: `verification_cases`, `verification_documents`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AdminAuthModule, AuditModule, NotificationsModule, StorageModule, UsersModule],
  controllers: [VerificationController, VerificationAdminController],
  providers: [
    VerificationStatusService,
    VerificationService,
    VerificationReviewService,
    VerificationFilesService,
    VerificationMaintenanceService,
  ],
  exports: [VerificationStatusService, VerificationMaintenanceService],
})
export class VerificationModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly maintenance: VerificationMaintenanceService,
  ) {}

  /** Schedules the daily expiry and reminders, and the hourly purge of documents past retention. */
  onModuleInit(): void {
    this.jobs.register('verification.expire-and-remind', '17 6 * * *', async () => {
      await this.maintenance.expireCases();
      await this.maintenance.sendExpiryReminders();
    });
    this.jobs.register('verification.purge-documents', '47 * * * *', async () => {
      await this.maintenance.purge();
    });
  }
}
