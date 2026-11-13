'use client';

import { ApiFailure } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';

/** API error codes and the sentence the console shows for each. */
const KNOWN: Partial<Record<ApiFailure['code'], MessageKey>> = {
  NETWORK: 'admin.errors.network',
  VALIDATION_FAILED: 'admin.errors.validation',
  UNAUTHENTICATED: 'admin.errors.sessionEnded',
  SESSION_INVALID: 'admin.errors.sessionEnded',
  INVALID_CREDENTIALS: 'admin.errors.invalidCredentials',
  ACCOUNT_LOCKED: 'admin.errors.accountLocked',
  ACCOUNT_SUSPENDED: 'admin.errors.accountSuspended',
  TOTP_INVALID: 'admin.errors.totpInvalid',
  CHALLENGE_INVALID: 'admin.errors.challengeInvalid',
  RATE_LIMITED: 'admin.errors.rateLimited',
  FORBIDDEN: 'admin.errors.forbidden',
  ORIGIN_NOT_ALLOWED: 'admin.errors.origin',
  NOT_FOUND: 'admin.errors.notFound',
  INVALID_STATE: 'admin.errors.invalidState',
  VERSION_CONFLICT: 'admin.errors.versionConflict',
  UPLOAD_INVALID: 'admin.errors.uploadInvalid',
  UPLOAD_EXPIRED: 'admin.errors.uploadExpired',
  CONTENT_UNAVAILABLE: 'admin.errors.contentUnavailable',
};

/** Error → sentence in the UI language (the server's own message is never shown). */
export function useErrorText(): (error: unknown) => string {
  const { t } = useI18n();
  return (error) => {
    const key = error instanceof ApiFailure ? KNOWN[error.code] : undefined;
    return t(key ?? 'admin.errors.generic');
  };
}
