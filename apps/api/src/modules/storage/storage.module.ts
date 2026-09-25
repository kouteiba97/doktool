import { Module } from '@nestjs/common';

/**
 * StorageService and its Cloudflare R2 adapter — the only code allowed to use the S3 SDK (ADR-002).
 *
 * Owns no table.
 * Built in Phase 5 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class StorageModule {}
