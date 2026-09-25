import { Module } from '@nestjs/common';

/**
 * The append-only audit log written on every admin mutation.
 *
 * Owns: `audit_log_entries`.
 * Built in Phase 16 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class AuditModule {}
