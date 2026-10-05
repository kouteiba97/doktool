// Public entry point of the clinical-review module (ADR-001). Other modules import from here only.
export { ClinicalReviewModule } from './clinical-review.module.js';
export { type Approval, ClinicalReviewService, type SignOffs } from './clinical-review.service.js';
