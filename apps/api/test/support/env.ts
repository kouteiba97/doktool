import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Env, loadEnv } from '../../src/config/env.js';

export const TEST_ADMIN_ORIGIN = 'http://admin.test';
export const TEST_TERMS_VERSION = 'test-terms-1';
/** Local-driver storage for tests, outside the repository. */
export const TEST_STORAGE_DIR = path.join(tmpdir(), 'doktool-test-storage');

/** A complete, valid environment for tests; secrets are fixed test values, never real ones. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://unit-test.invalid/doktool',
    USER_JWT_SECRET: 'test-user-jwt-secret-0123456789abcdef',
    OTP_HMAC_SECRET: 'test-otp-hmac-secret-0123456789abcdef',
    ANALYTICS_SUBJECT_SECRET: 'test-analytics-subject-secret-0123456789',
    ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ADMIN_WEB_ORIGIN: TEST_ADMIN_ORIGIN,
    TERMS_VERSION: TEST_TERMS_VERSION,
    JOBS_ENABLED: 'false',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: TEST_STORAGE_DIR,
    ...overrides,
  });
}
