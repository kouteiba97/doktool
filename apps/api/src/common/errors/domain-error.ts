import { HttpStatus } from '@nestjs/common';

/**
 * Stable error codes of the API contract. Clients translate them with their own catalogue; the
 * `message` field is for developers and logs only.
 */
export const ErrorCode = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  SESSION_INVALID: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  IDENTIFIER_NOT_CONFIRMED: HttpStatus.FORBIDDEN,
  ORIGIN_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  FEATURE_LOCKED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  ACCOUNT_EXISTS: HttpStatus.CONFLICT,
  PROFILE_ALREADY_SET: HttpStatus.CONFLICT,
  OTP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  OTP_EXPIRED: HttpStatus.GONE,
  TOTP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  CHALLENGE_INVALID: HttpStatus.UNAUTHORIZED,
  ACCOUNT_LOCKED: HttpStatus.LOCKED,
  OTP_LOCKED: HttpStatus.LOCKED,
  OTP_RESEND_TOO_SOON: HttpStatus.TOO_MANY_REQUESTS,
  OTP_SEND_LIMIT: HttpStatus.TOO_MANY_REQUESTS,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  CHANNEL_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
} as const;

export type ErrorCode = keyof typeof ErrorCode;

export interface ErrorDetails {
  /** When the client may retry (lockouts, rate limits, resend timers). */
  retryAt?: string;
  attemptsRemaining?: number;
  fields?: Record<string, string[]>;
  /** FEATURE_LOCKED: the entitlement lock to render (ADR-010). */
  lockReason?: string;
  unlockPath?: string | null;
}

/** An expected, client-facing failure. Anything else is a 500. */
export class DomainError extends Error {
  readonly status: HttpStatus;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.status = ErrorCode[code];
  }
}
