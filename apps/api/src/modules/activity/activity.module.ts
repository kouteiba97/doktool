import { Module } from '@nestjs/common';
import { AccessModule } from '../access/index.js';
import { CalculatorsModule } from '../calculators/index.js';
import { PregnancyModule } from '../pregnancy/index.js';
import { ReferenceLibraryModule } from '../reference-library/index.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';

/**
 * Favorites and recent activity (« Activité »).
 *
 * Owns: `favorites`, `recent_activities`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AccessModule, CalculatorsModule, ReferenceLibraryModule, PregnancyModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
