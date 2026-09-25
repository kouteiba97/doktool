// Public entry point of the verification module (ADR-001). Other modules import from here only.
export { VerificationModule } from './verification.module.js';
export {
  VerificationStatusService,
  type CaseSnapshot,
  type VerificationSnapshot,
} from './verification-status.service.js';
