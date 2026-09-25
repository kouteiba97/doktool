import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Accounts, professional profiles, preferences and the reference pickers (wilayas, specialties, institutions, universities).
 *
 * Owns: `users`, `professional_profiles`, `user_preferences`, `wilayas`, `specialties`, `institutions`, `universities`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('users.purge-unconfirmed', '23 * * * *', async () => {
      await this.users.purgeUnconfirmedAccounts();
    });
  }
}
