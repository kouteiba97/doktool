import { Module } from '@nestjs/common';

/**
 * Offline manifests of the content each account is entitled to.
 *
 * Owns no table.
 * Built in Phase 15 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class OfflineModule {}
