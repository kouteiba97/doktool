import { Module } from '@nestjs/common';

/**
 * Demo sessions and the demo content subset (Lock L37, ADR-006 Q5).
 *
 * Owns: `demo_sessions`.
 * Built in Phase 14 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class DemoModule {}
