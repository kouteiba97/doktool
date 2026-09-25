import { Module } from '@nestjs/common';

/**
 * Admin-facing read models and grant checks behind /admin/v1.
 *
 * Owns no table.
 * Built in Phase 16 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class AdminModule {}
