import { Module, type OnModuleInit } from '@nestjs/common';
import {
  ANALYTICS_SERVER_EVENT_JOB,
  type ServerAnalyticsEvent,
} from '../../infrastructure/jobs/analytics-job.js';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { AccessModule } from '../access/index.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { CalculatorsModule } from '../calculators/index.js';
import { DemoModule } from '../demo/index.js';
import { ReferenceLibraryModule } from '../reference-library/index.js';
import { UsersModule } from '../users/index.js';
import { VerificationModule } from '../verification/index.js';
import { AnalyticsAdminController, AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * Pseudonymous event ingestion and aggregates (Lock L42, section 16).
 *
 * Owns: `analytics_events`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [
    AccessModule,
    AdminAuthModule,
    CalculatorsModule,
    DemoModule,
    ReferenceLibraryModule,
    UsersModule,
    VerificationModule,
  ],
  controllers: [AnalyticsController, AnalyticsAdminController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly analytics: AnalyticsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerWorker(ANALYTICS_SERVER_EVENT_JOB, async (data) => {
      await this.analytics.recordServerEvent(data as ServerAnalyticsEvent);
    });
  }
}
