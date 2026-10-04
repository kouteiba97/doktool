import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { CalculatorsModule } from '../calculators/index.js';
import { PregnancyModule } from '../pregnancy/index.js';
import { ReferenceLibraryModule } from '../reference-library/index.js';
import { SearchAdminController, SearchController } from './search.controllers.js';
import { SearchService } from './search.service.js';

/**
 * The V1 search index over reference documents and calculators (section 12, ADR-014).
 *
 * Owns: `search_synonyms`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [
    AdminAuthModule,
    AuditModule,
    CalculatorsModule,
    PregnancyModule,
    ReferenceLibraryModule,
  ],
  controllers: [SearchController, SearchAdminController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
