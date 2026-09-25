import { Module } from '@nestjs/common';
import { VerificationStatusService } from './verification-status.service.js';

/**
 * Identity, professional-status and student-status cases, their documents and decisions.
 * Phase 4 provides the read side used by the access policy; submission and review arrive in Phase 9.
 *
 * Owns: `verification_cases`, `verification_documents`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  providers: [VerificationStatusService],
  exports: [VerificationStatusService],
})
export class VerificationModule {}
