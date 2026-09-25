import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service.js';
import { RateLimiter } from './rate-limiter.js';

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

  onModuleInit(): void {
    this.jobs.register('maintenance.rate-limit-purge', '17 * * * *', async () => {
      await this.limiter.purgeExpired();
    });
  }
}
