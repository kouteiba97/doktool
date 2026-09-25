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

  it('requires SMTP settings in production', () => {
    expect(issuesOf({ ...required, NODE_ENV: 'production' })).toEqual([
      'SMTP_URL: SMTP_URL and MAIL_FROM are required in production (OTP e-mails)',
    ]);
    expect(
      issuesOf({
        ...required,
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
