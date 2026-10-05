import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { ClinicalReviewController } from './clinical-review.controller.js';
import { ClinicalReviewService } from './clinical-review.service.js';

/**
 * Double sign-off for clinical content (ADR-024): how many independent reviewers calculators and
 * pregnancy profiles need before publication.
 *
 * Owns: `clinical_review_policies`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AdminAuthModule, AuditModule],
  controllers: [ClinicalReviewController],
  providers: [ClinicalReviewService],
  exports: [ClinicalReviewService],
})
export class ClinicalReviewModule {}
