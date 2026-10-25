import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import type { Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { CryptoModule } from './infrastructure/crypto/crypto.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { JobsModule } from './infrastructure/jobs/jobs.module.js';
import { MessagingModule } from './infrastructure/messaging/messaging.module.js';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module.js';
import { SecurityModule } from './infrastructure/security/security.module.js';
import { DOMAIN_MODULES } from './modules/index.js';

/**
 * Root module: the infrastructure modules (config, database, jobs, crypto, rate limits, messaging,
 * security, health) plus every domain module listed in modules/index.ts.
 */
@Module({})
export class AppModule {
  /** Builds the root module for one validated environment (the tests pass their own). */
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        DatabaseModule,
        JobsModule,
        CryptoModule,
        RateLimitModule,
        MessagingModule,
        SecurityModule,
        HealthModule,
        ...DOMAIN_MODULES,
      ],
    };
  }
}
