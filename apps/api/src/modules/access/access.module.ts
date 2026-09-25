import { Module } from '@nestjs/common';

/**
 * The entitlement policy engine — the only place access is decided (ADR-004, ADR-006). Owns no table: AccessProfile is derived.
 *
 * Owns no table.
 * Built in Phase 4 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class AccessModule {}
