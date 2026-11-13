import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, base64url (refresh tokens, admin session and challenge tokens). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hex SHA-256; tokens are stored only in this form. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Hex HMAC-SHA-256 of `value` with `key` (OTP codes, analytics subjects): unlike a plain hash it
 * cannot be recomputed without the secret.
 */
export function hmacSha256Hex(key: string, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function hexDigestsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** Uniform numeric code, zero-padded (OTP). */
export function randomNumericCode(digits: number): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');
}
