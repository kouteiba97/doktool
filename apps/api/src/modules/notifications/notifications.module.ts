import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * In-app notifications rendered from catalogue keys.
 *
 * Owns: `notifications`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Schedules the daily deletion of notifications older than the retention period. */
  onModuleInit(): void {
    this.jobs.register('notifications.purge-old', '41 3 * * *', async () => {
      await this.notifications.purgeOld();
    });
  }
}
