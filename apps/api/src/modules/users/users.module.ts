import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { StorageModule } from '../storage/index.js';
import { ProfilePhotoService } from './profile-photo.service.js';
import {
  ReferenceDataAdminController,
  ReferenceDataController,
} from './reference-data.controllers.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Accounts, professional profiles, preferences and the reference pickers (wilayas, specialties, institutions, universities).
 *
 * Owns: `users`, `professional_profiles`, `user_preferences`, `wilayas`, `specialties`, `institutions`, `universities`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AdminAuthModule, AuditModule, StorageModule],
  controllers: [UsersController, ReferenceDataController, ReferenceDataAdminController],
  providers: [UsersService, ProfilePhotoService],
  exports: [UsersService],
})
export class UsersModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly users: UsersService,
  ) {}

  /** Schedules the hourly deletion of sign-ups never confirmed. */
  onModuleInit(): void {
    this.jobs.register('users.purge-unconfirmed', '23 * * * *', async () => {
      await this.users.purgeUnconfirmedAccounts();
    });
  }
}
