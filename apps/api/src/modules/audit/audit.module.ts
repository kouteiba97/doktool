import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/**
 * The append-only audit log written on every admin mutation and on admin sign-in events.
 *
 * Owns: `audit_log_entries`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
