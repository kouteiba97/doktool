import { type Env, loadEnv } from '../../src/config/env.js';

export const TEST_ADMIN_ORIGIN = 'http://admin.test';
export const TEST_TERMS_VERSION = 'test-terms-1';

/** A complete, valid environment for tests; secrets are fixed test values, never real ones. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://unit-test.invalid/doktool',
    USER_JWT_SECRET: 'test-user-jwt-secret-0123456789abcdef',
    OTP_HMAC_SECRET: 'test-otp-hmac-secret-0123456789abcdef',
    ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ADMIN_WEB_ORIGIN: TEST_ADMIN_ORIGIN,
    TERMS_VERSION: TEST_TERMS_VERSION,
    JOBS_ENABLED: 'false',
    ...overrides,
  });
}
