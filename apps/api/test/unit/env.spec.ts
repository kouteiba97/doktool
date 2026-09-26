import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, loadEnv } from '../../src/config/env.js';

const required = {
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  USER_JWT_SECRET: 'x'.repeat(32),
  OTP_HMAC_SECRET: 'y'.repeat(32),
  ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  ADMIN_WEB_ORIGIN: 'https://admin.doktool.dz/',
  TERMS_VERSION: '2026-09',
};

/** A complete R2 configuration, so production tests isolate the rule they check. */
const r2 = {
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: 'acc',
  R2_CONTENT_ACCESS_KEY_ID: 'a',
  R2_CONTENT_SECRET_ACCESS_KEY: 'b',
  R2_PRIVATE_ACCESS_KEY_ID: 'c',
  R2_PRIVATE_SECRET_ACCESS_KEY: 'd',
};

/** Legal pages, required in production. */
const legal = {
  TERMS_URL: 'https://doktool.dz/cgu',
  PRIVACY_URL: 'https://doktool.dz/confidentialite',
};

const issuesOf = (source: Record<string, string>): string[] => {
  try {
    loadEnv(source);
    return [];
  } catch (error) {
    return (error as InvalidEnvironmentError).issues;
  }
};

describe('loadEnv', () => {
  it('applies defaults, coerces numbers and normalises the admin origin', () => {
    const env = loadEnv({ ...required, PORT: '8080' });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      TRUST_PROXY_HOPS: 0,
      JOBS_ENABLED: true,
      ADMIN_WEB_ORIGIN: 'https://admin.doktool.dz',
    });
  });

  it('refuses to start without its required settings', () => {
    expect(() => loadEnv({})).toThrow(InvalidEnvironmentError);
    expect(issuesOf({}).length).toBeGreaterThanOrEqual(6);
  });

  it('refuses a non-PostgreSQL URL', () => {
    expect(issuesOf({ ...required, DATABASE_URL: 'mysql://u@localhost/db' })).toEqual([
      'DATABASE_URL: DATABASE_URL must be a PostgreSQL URL',
    ]);
  });

  it('refuses short secrets and a TOTP key that is not 32 bytes', () => {
    const issues = issuesOf({
      ...required,
      USER_JWT_SECRET: 'short',
      ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
    });
    expect(issues).toHaveLength(2);
  });

  it('requires the legal page links in production', () => {
    expect(
      issuesOf({
        ...required,
        ...r2,
        NODE_ENV: 'production',
        SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
        MAIL_FROM: 'DokTool <no-reply@example.com>',
      }),
    ).toEqual([
      'TERMS_URL: TERMS_URL and PRIVACY_URL are required in production (linked at sign-up)',
    ]);
  });

  it('requires SMTP settings in production', () => {
    expect(issuesOf({ ...required, ...r2, ...legal, NODE_ENV: 'production' })).toEqual([
      'SMTP_URL: SMTP_URL and MAIL_FROM are required in production (OTP e-mails)',
    ]);
    expect(
      issuesOf({
        ...required,
        ...r2,
        ...legal,
        NODE_ENV: 'production',
        SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
        MAIL_FROM: 'DokTool <no-reply@example.com>',
      }),
    ).toEqual([]);
  });

  it('parses JOBS_ENABLED strictly', () => {
    expect(loadEnv({ ...required, JOBS_ENABLED: 'false' }).JOBS_ENABLED).toBe(false);
    expect(issuesOf({ ...required, JOBS_ENABLED: 'no' })).toHaveLength(1);
  });
});
