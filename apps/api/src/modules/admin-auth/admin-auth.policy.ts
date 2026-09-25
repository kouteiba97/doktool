// Admin authentication parameters (docs/adr/ADR-009-authentication.md).
import type { RateLimitRule } from '../../infrastructure/rate-limit/rate-limiter.js';

export const ADMIN_SESSION_COOKIE = '__Host-doktool_admin';
export const ADMIN_SESSION_IDLE_MINUTES = 30;
export const ADMIN_SESSION_MAX_HOURS = 12;
/** lastSeenAt is written at most this often, to avoid a write per request. */
export const ADMIN_SESSION_TOUCH_SECONDS = 60;

export const ADMIN_CHALLENGE_TTL_MINUTES = 5;
export const ADMIN_CHALLENGE_MAX_ATTEMPTS = 5;

export const ADMIN_SIGN_IN_MAX_FAILURES = 5;
export const ADMIN_SIGN_IN_LOCK_MINUTES = 15;

export const ADMIN_RATE_LIMITS = {
  signInPerIp: { name: 'admin-sign-in:ip', limit: 10, windowSeconds: 600 },
  totpPerIp: { name: 'admin-totp:ip', limit: 20, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;
