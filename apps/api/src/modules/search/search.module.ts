import { Module } from '@nestjs/common';

/**
 * The V1 search index over reference documents and calculators.
 *
 * Owns no table.
 * Built in Phase 10 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class SearchModule {}
