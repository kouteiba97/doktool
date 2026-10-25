import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '../../common/errors/domain-error.js';
import type { Env } from '../../config/env.js';
import { isValidStorageKey } from './storage-keys.js';
import {
  type BucketId,
  type ByteRange,
  StorageService,
  type StoredObject,
  type UploadInput,
} from './storage.service.js';

export const LOCAL_OBJECTS_PATH = '/v1/storage/local/objects';

/** What a local signed URL allows, and until when. */
export interface LocalGrant {
  bucket: BucketId;
  key: string;
  method: 'GET' | 'PUT';
  /** Unix seconds. */
  expiresAt: number;
  contentType?: string;
  contentLength?: number;
}

/** What is kept next to each local object. */
interface Metadata {
  contentType: string;
  sizeBytes: number;
  etag: string;
}

const BUCKETS: readonly BucketId[] = ['CONTENT', 'PRIVATE'];

/**
 * Development and test storage on the local disk (ADR-011). Objects are never served statically:
 * only through {@link LOCAL_OBJECTS_PATH} with an HMAC-signed, expiring grant, exactly like
 * presigned R2 URLs. Production refuses this driver.
 */
export class LocalStorageAdapter extends StorageService {
  private readonly root: string;
  private readonly baseUrl: string;
  private readonly signingKey: Buffer;

  constructor(env: Env) {
    super();
    this.root = path.resolve(env.LOCAL_STORAGE_DIR);
    this.baseUrl = env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`;
    this.signingKey = Buffer.from(
      hkdfSync('sha256', env.USER_JWT_SECRET, 'doktool', 'local-storage-signed-urls', 32),
    );
  }

  /** Writes the file (never over an existing one) and its metadata. */
  async upload(input: UploadInput): Promise<StoredObject> {
    const { file, meta } = this.paths(input.bucket, input.key);
    await mkdir(path.dirname(file), { recursive: true });
    await mkdir(path.dirname(meta), { recursive: true });
    try {
      // `wx`: fail if the key exists — keys are immutable.
      await writeFile(file, input.body, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new DomainError('UPLOAD_INVALID', 'An object already exists under this key.');
      }
      throw error;
    }
    const metadata: Metadata = {
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
      etag: createHash('sha256').update(input.body).digest('hex'),
    };
    await writeFile(meta, JSON.stringify(metadata));
    return { bucket: input.bucket, key: input.key, ...metadata };
  }

  /** Deletes the file and its metadata. */
  async delete(bucket: BucketId, key: string): Promise<void> {
    const { file, meta } = this.paths(bucket, key);
    await rm(file, { force: true });
    await rm(meta, { force: true });
  }

  /** Size, type and checksum of a local object, or null. */
  async head(bucket: BucketId, key: string): Promise<StoredObject | null> {
    const { file, meta } = this.paths(bucket, key);
    try {
      const [info, raw] = await Promise.all([stat(file), readFile(meta, 'utf8')]);
      const metadata = JSON.parse(raw) as Metadata;
      return {
        bucket,
        key,
        sizeBytes: info.size,
        contentType: metadata.contentType,
        etag: metadata.etag,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** The bytes of a local object (or a range of them). */
  async download(bucket: BucketId, key: string, range?: ByteRange): Promise<Uint8Array> {
    const bytes = await readFile(this.paths(bucket, key).file);
    return new Uint8Array(range ? bytes.subarray(range.start, range.end + 1) : bytes);
  }

  /** A signed, expiring GET URL served by LocalStorageController. */
  getSignedReadUrl(
    bucket: BucketId,
    key: string,
    options: { ttlSeconds: number },
  ): Promise<string> {
    return Promise.resolve(
      this.sign({ bucket, key, method: 'GET', expiresAt: this.expiry(options.ttlSeconds) }),
    );
  }

  /** A signed, expiring PUT URL fixing type and size. */
  getSignedUploadUrl(
    bucket: BucketId,
    key: string,
    options: { contentType: string; contentLength: number; ttlSeconds: number },
  ): Promise<string> {
    return Promise.resolve(
      this.sign({
        bucket,
        key,
        method: 'PUT',
        expiresAt: this.expiry(options.ttlSeconds),
        contentType: options.contentType,
        contentLength: options.contentLength,
      }),
    );
  }

  /** Validates a signed URL token for `method`; throws FORBIDDEN when invalid or expired. */
  verifyGrant(token: string, method: LocalGrant['method'], now = Date.now()): LocalGrant {
    const [payload, signature] = token.split('.');
    const forbidden = () =>
      new DomainError('FORBIDDEN', 'The signed URL is invalid or has expired.');
    if (!payload || !signature) throw forbidden();
    const expected = createHmac('sha256', this.signingKey).update(payload).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw forbidden();
    const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LocalGrant;
    if (grant.method !== method || grant.expiresAt * 1000 <= now) throw forbidden();
    return grant;
  }

  /** Encodes and signs a grant into a URL. */
  private sign(grant: LocalGrant): string {
    const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
    const signature = createHmac('sha256', this.signingKey).update(payload).digest('base64url');
    return `${this.baseUrl}${LOCAL_OBJECTS_PATH}?token=${payload}.${signature}`;
  }

  /** Unix time `ttlSeconds` from now. */
  private expiry(ttlSeconds: number): number {
    return Math.floor(Date.now() / 1000) + ttlSeconds;
  }

  /** The file and metadata paths of a key, refusing anything outside the bucket folder. */
  private paths(bucket: BucketId, key: string): { file: string; meta: string } {
    if (!BUCKETS.includes(bucket) || !isValidStorageKey(key)) {
      throw new DomainError('UPLOAD_INVALID', 'Invalid storage key.');
    }
    const bucketRoot = path.join(this.root, bucket.toLowerCase());
    const file = path.resolve(bucketRoot, key);
    if (!file.startsWith(bucketRoot + path.sep))
      throw new DomainError('UPLOAD_INVALID', 'Invalid storage key.');
    return { file, meta: path.resolve(bucketRoot, '.meta', `${key}.json`) };
  }
}
