import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

/**
 * Demo sessions and their tokens (Lock L37, ADR-006 Q5, ADR-010). The demo content subset is the
 * `demoSample` flag on calculators and reference documents, decided by the access module.
 *
 * Owns: `demo_sessions`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
