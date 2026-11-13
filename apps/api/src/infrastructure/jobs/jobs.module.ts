import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

/** Global module giving every module the JobsService (background and scheduled jobs). */
@Global()
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
