import { Module } from '@nestjs/common';

/**
 * Identity, professional-status and student-status cases, their documents and decisions.
 *
 * Owns: `verification_cases`, `verification_documents`.
 * Built in Phase 9 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class VerificationModule {}
