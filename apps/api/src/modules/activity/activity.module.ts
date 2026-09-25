import { Module } from '@nestjs/common';

/**
 * Favorites and recent activity ("Research").
 *
 * Owns: `favorites`, `recent_activities`.
 * Built in Phase 13 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class ActivityModule {}
