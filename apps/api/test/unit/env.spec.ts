import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, loadEnv } from '../../src/config/env.js';

const required = {
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  USER_JWT_SECRET: 'x'.repeat(32),
  OTP_HMAC_SECRET: 'y'.repeat(32),
  ANALYTICS_SUBJECT_SECRET: 'a'.repeat(32),
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

/** Real payments, required in production (ADR-015, ADR-021). */
const payments = {
  PAYMENT_GATEWAYS: 'chargily',
  CHARGILY_MODE: 'live',
  CHARGILY_SECRET_KEY: 'live_sk_0123456789abcdef',
  PUBLIC_API_URL: 'https://api.doktool.dz',
};

const satim = {
  SATIM_BASE_URL: 'https://test2.satim.dz/payment/rest/',
  SATIM_USERNAME: 'merchant',
  SATIM_PASSWORD: 'secret',
  SATIM_TERMINAL_ID: 'E010000000',
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
        ...payments,
        NODE_ENV: 'production',
        SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
        MAIL_FROM: 'DokTool <no-reply@example.com>',
      }),
    ).toEqual([
      'TERMS_URL: TERMS_URL and PRIVACY_URL are required in production (linked at sign-up)',
    ]);
  });

  it('requires SMTP settings in production', () => {
    expect(issuesOf({ ...required, ...r2, ...legal, ...payments, NODE_ENV: 'production' })).toEqual(
      ['SMTP_URL: SMTP_URL and MAIL_FROM are required in production (OTP e-mails)'],
    );
    expect(
      issuesOf({
        ...required,
        ...r2,
        ...legal,
        ...payments,
        NODE_ENV: 'production',
        SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
        MAIL_FROM: 'DokTool <no-reply@example.com>',
      }),
    ).toEqual([]);
  });

  it('requires a real payment gateway in production', () => {
    expect(
      issuesOf({
        ...required,
        ...r2,
        ...legal,
        NODE_ENV: 'production',
        SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
        MAIL_FROM: 'DokTool <no-reply@example.com>',
      }),
    ).toEqual(['PAYMENT_GATEWAYS: production takes real payments (no fake gateway)']);
  });

  it('parses the gateway list by priority and refuses unknown or repeated gateways', () => {
    expect(loadEnv({ ...required }).PAYMENT_GATEWAYS).toEqual(['fake']);
    expect(
      loadEnv({ ...required, ...payments, ...satim, PAYMENT_GATEWAYS: ' Chargily , satim ' })
        .PAYMENT_GATEWAYS,
    ).toEqual(['chargily', 'satim']);
    expect(issuesOf({ ...required, PAYMENT_GATEWAYS: 'paypal' })).toHaveLength(1);
    expect(issuesOf({ ...required, PAYMENT_GATEWAYS: 'fake,fake' })).toEqual([
      'PAYMENT_GATEWAYS: a gateway is listed twice',
    ]);
  });

  it('requires the Chargily key of the right mode, live in production', () => {
    expect(issuesOf({ ...required, PAYMENT_GATEWAYS: 'chargily' })).toEqual([
      'PUBLIC_API_URL: PUBLIC_API_URL is required with a real payment gateway (return and webhook URLs)',
      'CHARGILY_SECRET_KEY: CHARGILY_SECRET_KEY is required with the chargily gateway',
    ]);
    expect(issuesOf({ ...required, ...payments, CHARGILY_MODE: 'test' })).toEqual([
      'CHARGILY_SECRET_KEY: CHARGILY_SECRET_KEY must be a test secret key (test_sk_…)',
    ]);
    expect(
      issuesOf({
        ...required,
        ...r2,
        ...legal,
        ...payments,
        CHARGILY_MODE: 'test',
        CHARGILY_SECRET_KEY: 'test_sk_0123',
        NODE_ENV: 'production',
        SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
        MAIL_FROM: 'DokTool <no-reply@example.com>',
      }),
    ).toEqual(['CHARGILY_MODE: production takes real payments (CHARGILY_MODE=live)']);
  });

  it('requires every SATIM setting with the satim gateway', () => {
    expect(
      issuesOf({
        ...required,
        PAYMENT_GATEWAYS: 'satim',
        PUBLIC_API_URL: 'https://api.doktool.dz',
      }),
    ).toHaveLength(4);
    expect(
      loadEnv({ ...required, ...payments, ...satim, PAYMENT_GATEWAYS: 'satim' }).SATIM_BASE_URL,
    ).toBe('https://test2.satim.dz/payment/rest');
  });

  it('parses JOBS_ENABLED strictly', () => {
    expect(loadEnv({ ...required, JOBS_ENABLED: 'false' }).JOBS_ENABLED).toBe(false);
    expect(issuesOf({ ...required, JOBS_ENABLED: 'no' })).toHaveLength(1);
  });
});
