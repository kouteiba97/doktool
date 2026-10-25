import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service.js';
import { RateLimiter } from './rate-limiter.js';

/** Global module exposing the RateLimiter, and scheduling the hourly clean-up of old counters. */
@Global()
@Module({
  providers: [RateLimiter],
  exports: [RateLimiter],
})
export class RateLimitModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Registers the purge job at minute 17 of every hour. */
  onModuleInit(): void {
    this.jobs.register('maintenance.rate-limit-purge', '17 * * * *', async () => {
      await this.limiter.purgeExpired();
    });
  }
}
