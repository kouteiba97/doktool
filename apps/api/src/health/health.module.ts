import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/** Exposes GET /v1/health. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
