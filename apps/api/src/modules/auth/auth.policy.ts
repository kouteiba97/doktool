// User-authentication parameters (docs/adr/ADR-009-authentication.md).
import type { RateLimitRule } from '../../infrastructure/rate-limit/rate-limiter.js';

export const OTP_DIGITS = 6;
export const OTP_TTL_MINUTES = 10;
/** Wrong codes allowed before the challenge locks (spec: 3 tries then 10 minutes). */
export const OTP_MAX_FAILED_ATTEMPTS = 3;
export const OTP_LOCK_MINUTES = 10;
/** Minimum delay between two sends of the same challenge (spec: 60 s). */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_SENDS = 5;

export const REFRESH_TOKEN_TTL_DAYS = 30;
export const SESSION_MAX_AGE_DAYS = 180;
/** Revoked or ended sessions stay listable this long before the purge job removes them. */
export const SESSION_RETENTION_DAYS = 30;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const RATE_LIMITS = {
  signUpPerIp: { name: 'sign-up:ip', limit: 10, windowSeconds: 3600 },
  signInPerIp: { name: 'sign-in:ip', limit: 20, windowSeconds: 600 },
  refreshPerIp: { name: 'refresh:ip', limit: 120, windowSeconds: 600 },
  otpVerifyPerIp: { name: 'otp-verify:ip', limit: 30, windowSeconds: 600 },
  otpResendPerDestination: { name: 'otp-resend:destination', limit: 5, windowSeconds: 3600 },
  resetPerIdentifier: { name: 'reset:identifier', limit: 5, windowSeconds: 3600 },
  resetPerIp: { name: 'reset:ip', limit: 20, windowSeconds: 3600 },
  deleteAccountPerUser: { name: 'account-delete:user', limit: 5, windowSeconds: 3600 },
  /** Password checks of signed-in changes (contacts, password): a stolen phone can't brute-force. */
  accountChangePerUser: { name: 'account-change:user', limit: 10, windowSeconds: 3600 },
  recoveryPerIp: { name: 'recovery:ip', limit: 5, windowSeconds: 3600 },
  recoveryPerClaimed: { name: 'recovery:claimed', limit: 3, windowSeconds: 24 * 3600 },
  recoveryPerNewContact: { name: 'recovery:contact', limit: 3, windowSeconds: 24 * 3600 },
  recoveryUploadPerRequest: { name: 'recovery:upload', limit: 10, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export const DAY_MS = 24 * 3600 * 1000;

// Assisted account recovery (ADR-023).
/** The code and the photos must be sent within this delay after the request. */
export const RECOVERY_DOCUMENTS_TTL_MINUTES = 60;
/** An approved recovery applies after this delay; the owner signing in meanwhile cancels it. */
export const RECOVERY_HOLD_HOURS = 24;
/** Recovery photos are deleted this long after the decision (or the cancellation). */
export const RECOVERY_DOCUMENT_RETENTION_DAYS = 30;
/** Requests answered by the team within this delay (shown to the person). */
export const RECOVERY_REVIEW_HOURS = 72;
export const RECOVERY_REJECTION_REASONS = [
  'PHOTO_UNREADABLE',
  'IDENTITY_MISMATCH',
  'SELFIE_MISMATCH',
  'NO_ACCOUNT',
  'OTHER',
] as const;
export type RecoveryRejectionReason = (typeof RECOVERY_REJECTION_REASONS)[number];
