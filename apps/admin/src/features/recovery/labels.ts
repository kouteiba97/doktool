import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import type { BadgeTone } from '@/ui/badge';

/** API enums used by the recovery pages. */
export type RecoveryStatus = Schemas['RecoveryStatus'];
export type RecoveryRejectionReason = Schemas['RecoveryRejectionReason'];
export type RecoveryPhotoSlot = Schemas['RecoveryPhotoSlot'];

/** Cache key of the recovery pages. */
export const recoveryKey = ['admin', 'account-recoveries'] as const;

/** The queue tabs, in the order a reviewer works them. */
export const RECOVERY_TABS: RecoveryStatus[] = [
  'SUBMITTED',
  'APPROVED',
  'APPLIED',
  'REJECTED',
  'CANCELED',
];

/** Catalogue key of each status. */
export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, MessageKey> = {
  AWAITING_DOCUMENTS: 'admin.recovery.statusAwaiting',
  SUBMITTED: 'admin.recovery.statusSubmitted',
  APPROVED: 'admin.recovery.statusApproved',
  APPLIED: 'admin.recovery.statusApplied',
  REJECTED: 'admin.recovery.statusRejected',
  CANCELED: 'admin.recovery.statusCanceled',
  EXPIRED: 'admin.recovery.statusExpired',
};

/** Badge colour of each status. */
export const RECOVERY_STATUS_TONES: Record<RecoveryStatus, BadgeTone> = {
  AWAITING_DOCUMENTS: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'warning',
  APPLIED: 'success',
  REJECTED: 'outline',
  CANCELED: 'outline',
  EXPIRED: 'outline',
};

/** Rejection reasons, in the picker's order. */
export const RECOVERY_REJECTION_REASONS: RecoveryRejectionReason[] = [
  'PHOTO_UNREADABLE',
  'IDENTITY_MISMATCH',
  'SELFIE_MISMATCH',
  'NO_ACCOUNT',
  'OTHER',
];

/** Catalogue key of each rejection reason. */
export const RECOVERY_REJECTION_LABELS: Record<RecoveryRejectionReason, MessageKey> = {
  PHOTO_UNREADABLE: 'admin.recovery.reasonPhotoUnreadable',
  IDENTITY_MISMATCH: 'admin.recovery.reasonIdentityMismatch',
  SELFIE_MISMATCH: 'admin.recovery.reasonSelfieMismatch',
  NO_ACCOUNT: 'admin.recovery.reasonNoAccount',
  OTHER: 'admin.recovery.reasonOther',
};

/** Catalogue key of each photo. */
export const RECOVERY_SLOT_LABELS: Record<RecoveryPhotoSlot, MessageKey> = {
  IDENTITY_DOCUMENT: 'admin.recovery.photoIdentity',
  SELFIE: 'admin.recovery.photoSelfie',
};
