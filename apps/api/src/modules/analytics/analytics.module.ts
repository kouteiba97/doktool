import { Module } from '@nestjs/common';

/**
 * Pseudonymous event ingestion and aggregates (Lock L42).
 *
 * Owns: `analytics_events`.
 * Built in Phase 17 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class AnalyticsModule {}
