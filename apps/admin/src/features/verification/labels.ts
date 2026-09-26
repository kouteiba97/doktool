import type { Schemas } from '@/api/client';
import type { BadgeTone } from '@/ui/badge';
import type { MessageKey } from '@/i18n/messages';

export type VerificationStatus = Schemas['VerificationStatus'];
export type VerificationType = Schemas['VerificationType'];
export type RejectionReason = Schemas['VerificationRejectionReason'];
export type StepType = Schemas['VerificationStepType'];
export type ProfessionalType = Schemas['ProfessionalType'];

/** Verification service level: a case waiting longer is flagged (Admin Web preview « SLA 24 h »). */
export const VERIFICATION_SLA_HOURS = 24;

export const TYPE_LABELS: Record<VerificationType, MessageKey> = {
  IDENTITY: 'admin.verification.typeIdentity',
  PROFESSIONAL_STATUS: 'admin.verification.typeProfessional',
  STUDENT_STATUS: 'admin.verification.typeStudent',
};

export const STATUS_LABELS: Record<VerificationStatus, MessageKey> = {
  NOT_STARTED: 'admin.verification.statusNotStarted',
  SUBMITTED: 'admin.verification.statusSubmitted',
  IN_REVIEW: 'admin.verification.statusInReview',
  VERIFIED: 'admin.verification.statusVerified',
  REJECTED: 'admin.verification.statusRejected',
  EXPIRED: 'admin.verification.statusExpired',
  APPEALED: 'admin.verification.statusAppealed',
};

export const STATUS_TONES: Record<VerificationStatus, BadgeTone> = {
  NOT_STARTED: 'neutral',
  SUBMITTED: 'info',
  IN_REVIEW: 'brand',
  VERIFIED: 'success',
  REJECTED: 'critical',
  EXPIRED: 'neutral',
  APPEALED: 'warning',
};

export const REJECTION_LABELS: Record<RejectionReason, MessageKey> = {
  ILLEGIBLE: 'admin.verification.rejectIllegible',
  DOCUMENT_EXPIRED: 'admin.verification.rejectDocumentExpired',
  NAME_MISMATCH: 'admin.verification.rejectNameMismatch',
  WRONG_DOCUMENT: 'admin.verification.rejectWrongDocument',
  INFORMATION_MISMATCH: 'admin.verification.rejectInformationMismatch',
  OTHER: 'admin.verification.rejectOther',
};

export const REJECTION_REASONS = Object.keys(REJECTION_LABELS) as RejectionReason[];

export const STEP_LABELS: Record<StepType, MessageKey> = {
  IDENTITY_FRONT: 'admin.verification.stepIdentityFront',
  IDENTITY_BACK: 'admin.verification.stepIdentityBack',
  ORDER_PROOF: 'admin.verification.stepOrderProof',
  RESIDENCY_ATTESTATION: 'admin.verification.stepResidencyAttestation',
  STUDENT_PROOF: 'admin.verification.stepStudentProof',
};

export const PROFESSIONAL_TYPE_LABELS: Record<ProfessionalType, MessageKey> = {
  DOCTOR: 'admin.common.typeDoctor',
  RESIDENT: 'admin.common.typeResident',
  STUDENT: 'admin.common.typeStudent',
};

export const DOCUMENT_KIND_LABELS: Record<
  NonNullable<Schemas['VerificationDeclaredDetailsDto']['documentKind']>,
  MessageKey
> = {
  NATIONAL_ID: 'admin.verification.kindNationalId',
  PASSPORT: 'admin.verification.kindPassport',
  STUDENT_CARD: 'admin.verification.kindStudentCard',
};

/** Queue tabs (section 07): « En attente » is the API default (submitted, in review, appealed). */
export const QUEUE_TABS = ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'APPEALED'] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export const QUEUE_TAB_LABELS: Record<QueueTab, MessageKey> = {
  PENDING: 'admin.verification.tabPending',
  VERIFIED: 'admin.verification.tabVerified',
  REJECTED: 'admin.verification.tabRejected',
  EXPIRED: 'admin.verification.tabExpired',
  APPEALED: 'admin.verification.tabAppealed',
};

export function queueStatus(tab: QueueTab): VerificationStatus | undefined {
  return tab === 'PENDING' ? undefined : tab;
}

export function personName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/** The moment a case started waiting: its appeal, or its submission. */
export function waitingSince(item: {
  submittedAt?: string | null;
  appealedAt?: string | null;
}): string | null {
  return item.appealedAt ?? item.submittedAt ?? null;
}
