import { Module, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import { LocalStorageController } from './local-storage.controller.js';
import { R2StorageAdapter } from './r2-storage.adapter.js';
import { StorageService } from './storage.service.js';
import { UploadIntentsService } from './upload-intents.service.js';

/**
 * StorageService and its Cloudflare R2 adapter — the only code allowed to use the S3 SDK
 * (ADR-002, ADR-011). A local-disk adapter serves development and tests.
 *
 * Owns: `storage_upload_intents`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  controllers: [LocalStorageController],
  providers: [
    {
      provide: StorageService,
      inject: [ENV],
      useFactory: (env: Env): StorageService =>
        env.STORAGE_DRIVER === 'r2' ? new R2StorageAdapter(env) : new LocalStorageAdapter(env),
    },
    UploadIntentsService,
  ],
  exports: [StorageService, UploadIntentsService],
})
export class StorageModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly intents: UploadIntentsService,
  ) {}

  /** Schedules the hourly clean-up of uploads never confirmed. */
  onModuleInit(): void {
    this.jobs.register('storage.purge-expired-uploads', '29 * * * *', async () => {
      await this.intents.purgeExpired();
    });
  }
}
