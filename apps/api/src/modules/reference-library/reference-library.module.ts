import { Module } from '@nestjs/common';

/**
 * Reference documents (ordonnances, certificates) and their immutable file versions.
 *
 * Owns: `reference_documents`, `reference_document_files`.
 * Built in Phase 6 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class ReferenceLibraryModule {}
