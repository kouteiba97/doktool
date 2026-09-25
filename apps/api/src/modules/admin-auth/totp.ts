import { Secret, TOTP } from 'otpauth';

/** RFC 6238 parameters understood by every authenticator app (ADR-009). */
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALGORITHM = 'SHA1';
/** Accept the previous and next 30-second step to absorb clock drift. */
const WINDOW = 1;

export interface TotpEnrollment {
  secretBase32: string;
  otpauthUri: string;
}

export function newTotpEnrollment(accountEmail: string): TotpEnrollment {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: 'DokTool Admin',
    label: accountEmail,
    secret,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
  });
  return { secretBase32: secret.base32, otpauthUri: totp.toString() };
}

/**
 * Returns the time step the code belongs to, or null when the code is wrong.
 * The caller must refuse a step that is not newer than the last one accepted (replay).
 */
export function matchTotpStep(secretBase32: string, code: string, now = Date.now()): number | null {
  const delta = TOTP.validate({
    token: code,
    secret: Secret.fromBase32(secretBase32),
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    timestamp: now,
    window: WINDOW,
  });
  return delta === null ? null : Math.floor(now / 1000 / PERIOD_SECONDS) + delta;
}
