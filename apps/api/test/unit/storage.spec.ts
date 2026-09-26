import { HeadObjectCommand, NotFound, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, describe, expect, it } from 'vitest';
import { type InvalidEnvironmentError, loadEnv } from '../../src/config/env.js';
import { LocalStorageAdapter } from '../../src/modules/storage/local-storage.adapter.js';
import { R2StorageAdapter } from '../../src/modules/storage/r2-storage.adapter.js';
import { isValidStorageKey, StorageKeys } from '../../src/modules/storage/storage-keys.js';
import { matchesSignature, UPLOAD_RULES } from '../../src/modules/storage/storage.policy.js';
import { testEnv } from '../support/env.js';

const SHA = 'a1b2c3d4'.repeat(8);

describe('StorageKeys', () => {
  it('builds the audit §8 key layout', () => {
    expect(StorageKeys.referenceDocument('ORDONNANCE', 'doc-1', 3, SHA)).toBe(
      'doktool/reference-documents/ordonnances/doc-1/v3-a1b2c3d4.pdf',
    );
    expect(StorageKeys.referenceDocument('CERTIFICATE', 'doc-2', 1, SHA)).toContain(
      '/certificates/doc-2/v1-',
    );
    expect(StorageKeys.verificationDocument('u', 'c', 'd', 'jpg')).toBe(
      'doktool/verification/u/c/d.jpg',
    );
    expect(() => StorageKeys.referenceDocument('ORDONNANCE', 'doc', 1, 'not-a-hash')).toThrow();
  });

  it('refuses traversal and malformed keys', () => {
    expect(isValidStorageKey('doktool/a/b.pdf')).toBe(true);
    for (const key of [
      'doktool/../etc/passwd',
      'other/a.pdf',
      'doktool//a.pdf',
      'doktool/a b.pdf',
    ]) {
      expect(isValidStorageKey(key)).toBe(false);
    }
  });
});

describe('file signatures', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);

  it('accepts PDF, JPEG and PNG only for the declared type', () => {
    const verification = UPLOAD_RULES.VERIFICATION_DOCUMENT;
    expect(
      matchesSignature(
        UPLOAD_RULES.REFERENCE_DOCUMENT,
        'application/pdf',
        bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31),
      ),
    ).toBe(true);
    expect(matchesSignature(verification, 'image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(
      matchesSignature(
        verification,
        'image/png',
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      ),
    ).toBe(true);
    expect(matchesSignature(verification, 'image/png', bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(
      matchesSignature(UPLOAD_RULES.REFERENCE_DOCUMENT, 'image/jpeg', bytes(0xff, 0xd8, 0xff)),
    ).toBe(false);
  });
});

describe('LocalStorageAdapter signed URLs', () => {
  const adapter = new LocalStorageAdapter(testEnv({ PUBLIC_API_URL: 'http://api.test/' }));
  const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? '';

  it('grants reads until expiry, for GET only', async () => {
    const url = await adapter.getSignedReadUrl('CONTENT', 'doktool/x.pdf', { ttlSeconds: 600 });
    expect(url.startsWith('http://api.test/v1/storage/local/objects?token=')).toBe(true);
    expect(adapter.verifyGrant(tokenOf(url), 'GET')).toMatchObject({
      bucket: 'CONTENT',
      key: 'doktool/x.pdf',
    });
    expect(() => adapter.verifyGrant(tokenOf(url), 'PUT')).toThrow(/invalid or has expired/);
    expect(() => adapter.verifyGrant(tokenOf(url), 'GET', Date.now() + 601_000)).toThrow(/expired/);
  });

  it('rejects a tampered grant', async () => {
    const url = await adapter.getSignedReadUrl('CONTENT', 'doktool/x.pdf', { ttlSeconds: 600 });
    const [payload, signature] = tokenOf(url).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        bucket: 'PRIVATE',
      }),
    ).toString('base64url');
    expect(() => adapter.verifyGrant(`${forged}.${signature}`, 'GET')).toThrow();
    expect(() => adapter.verifyGrant('garbage', 'GET')).toThrow();
  });

  it('never resolves a key outside its bucket folder', async () => {
    await expect(adapter.head('CONTENT', 'doktool/../../escape.pdf')).rejects.toThrow(
      /Invalid storage key/,
    );
  });
});

describe('storage configuration', () => {
  const base = {
    DATABASE_URL: 'postgresql://u@h/db',
    USER_JWT_SECRET: 'x'.repeat(32),
    OTP_HMAC_SECRET: 'y'.repeat(32),
    ANALYTICS_SUBJECT_SECRET: 'a'.repeat(32),
    ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    ADMIN_WEB_ORIGIN: 'https://admin.example',
    TERMS_VERSION: 't',
  };
  const issues = (extra: Record<string, string>) => {
    try {
      loadEnv({ ...base, ...extra });
      return [];
    } catch (error) {
      return (error as InvalidEnvironmentError).issues;
    }
  };

  it('refuses the local driver in production', () => {
    expect(
      issues({ NODE_ENV: 'production', SMTP_URL: 'smtp://h:25', MAIL_FROM: 'a@b.c' }),
    ).toContain('STORAGE_DRIVER: production stores files in Cloudflare R2 (STORAGE_DRIVER=r2)');
  });

  it('requires both R2 API tokens with the r2 driver', () => {
    expect(issues({ STORAGE_DRIVER: 'r2' })).toHaveLength(5);
  });
});

describe('R2StorageAdapter', () => {
  const s3 = mockClient(S3Client);
  afterEach(() => s3.reset());

  const adapter = new R2StorageAdapter(
    testEnv({
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'acc123',
      R2_CONTENT_ACCESS_KEY_ID: 'CONTENTKEYID',
      R2_CONTENT_SECRET_ACCESS_KEY: 'content-secret',
      R2_PRIVATE_ACCESS_KEY_ID: 'PRIVATEKEYID',
      R2_PRIVATE_SECRET_ACCESS_KEY: 'private-secret',
    }),
  );

  it('presigns 10-minute inline reads on the account endpoint', async () => {
    const url = new URL(
      await adapter.getSignedReadUrl(
        'CONTENT',
        'doktool/reference-documents/ordonnances/d/v1-a1b2c3d4.pdf',
        {
          ttlSeconds: 600,
        },
      ),
    );
    expect(url.host).toBe('doktool-content.acc123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/doktool/reference-documents/ordonnances/d/v1-a1b2c3d4.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^CONTENTKEYID\//);
    expect(url.searchParams.get('response-content-disposition')).toBe('inline');
  });

  it('signs the private bucket with its own token and a 60-second lifetime', async () => {
    const url = new URL(
      await adapter.getSignedReadUrl('PRIVATE', 'doktool/verification/u/c/d.jpg', {
        ttlSeconds: 60,
      }),
    );
    expect(url.host).toBe('doktool-private.acc123.r2.cloudflarestorage.com');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^PRIVATEKEYID\//);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  it('binds upload URLs to the declared type and exact length', async () => {
    const url = new URL(
      await adapter.getSignedUploadUrl('CONTENT', 'doktool/reference-documents/x.pdf', {
        contentType: 'application/pdf',
        contentLength: 2048,
        ttlSeconds: 900,
      }),
    );
    const signed = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it('never overwrites a key and reports missing objects as null', async () => {
    s3.on(PutObjectCommand).resolves({ ETag: '"etag"' });
    s3.on(HeadObjectCommand).rejects(
      new NotFound({ message: 'not found', $metadata: { httpStatusCode: 404 } }),
    );

    await adapter.upload({
      bucket: 'CONTENT',
      key: 'doktool/a.pdf',
      body: new Uint8Array([1, 2]),
      contentType: 'application/pdf',
    });
    expect(s3.commandCalls(PutObjectCommand)[0]?.args[0].input).toMatchObject({
      Bucket: 'doktool-content',
      Key: 'doktool/a.pdf',
      IfNoneMatch: '*',
      ContentLength: 2,
    });
    expect(await adapter.head('CONTENT', 'doktool/missing.pdf')).toBeNull();
  });
});
