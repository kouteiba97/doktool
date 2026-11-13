import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../../config/env.js';
import {
  type BucketId,
  type ByteRange,
  StorageService,
  type StoredObject,
  type UploadInput,
} from './storage.service.js';

/** One R2 bucket and the client holding its own credentials. */
interface BucketTarget {
  name: string;
  client: S3Client;
}

/** Reads a required setting (the environment check already guarantees it). */
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required with STORAGE_DRIVER=r2`);
  return value;
}

/** True when R2 answered "no such object". */
const isNotFound = (error: unknown) =>
  error instanceof S3ServiceException &&
  (error.name === 'NotFound' ||
    error.name === 'NoSuchKey' ||
    error.$metadata.httpStatusCode === 404);

/**
 * Cloudflare R2 through its S3-compatible API (ADR-002). Each bucket has its own client and API
 * token, so the private (verification) bucket never shares credentials with content.
 */
export class R2StorageAdapter extends StorageService {
  private readonly buckets: Record<BucketId, BucketTarget>;

  constructor(env: Env) {
    super();
    const endpoint = `https://${required(env.R2_ACCOUNT_ID, 'R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
    const client = (accessKeyId: string, secretAccessKey: string) =>
      new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
    this.buckets = {
      CONTENT: {
        name: env.R2_CONTENT_BUCKET,
        client: client(
          required(env.R2_CONTENT_ACCESS_KEY_ID, 'R2_CONTENT_ACCESS_KEY_ID'),
          required(env.R2_CONTENT_SECRET_ACCESS_KEY, 'R2_CONTENT_SECRET_ACCESS_KEY'),
        ),
      },
      PRIVATE: {
        name: env.R2_PRIVATE_BUCKET,
        client: client(
          required(env.R2_PRIVATE_ACCESS_KEY_ID, 'R2_PRIVATE_ACCESS_KEY_ID'),
          required(env.R2_PRIVATE_SECRET_ACCESS_KEY, 'R2_PRIVATE_SECRET_ACCESS_KEY'),
        ),
      },
    };
  }

  /** PutObject, refusing to overwrite an existing key. */
  async upload(input: UploadInput): Promise<StoredObject> {
    const target = this.buckets[input.bucket];
    const result = await target.client.send(
      new PutObjectCommand({
        Bucket: target.name,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.byteLength,
        // Immutable keys: refuse to overwrite an existing object.
        IfNoneMatch: '*',
      }),
    );
    return {
      bucket: input.bucket,
      key: input.key,
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      etag: result.ETag ?? null,
    };
  }

  /** DeleteObject. */
  async delete(bucket: BucketId, key: string): Promise<void> {
    const target = this.buckets[bucket];
    await target.client.send(new DeleteObjectCommand({ Bucket: target.name, Key: key }));
  }

  /** HeadObject, or null when absent. */
  async head(bucket: BucketId, key: string): Promise<StoredObject | null> {
    const target = this.buckets[bucket];
    try {
      const result = await target.client.send(
        new HeadObjectCommand({ Bucket: target.name, Key: key }),
      );
      return {
        bucket,
        key,
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** GetObject (optionally a byte range). */
  async download(bucket: BucketId, key: string, range?: ByteRange): Promise<Uint8Array> {
    const target = this.buckets[bucket];
    const result = await target.client.send(
      new GetObjectCommand({
        Bucket: target.name,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    if (!result.Body) throw new Error(`Empty body for ${bucket}/${key}`);
    return result.Body.transformToByteArray();
  }

  /** A presigned GET URL (shown inline). */
  getSignedReadUrl(
    bucket: BucketId,
    key: string,
    options: { ttlSeconds: number },
  ): Promise<string> {
    const target = this.buckets[bucket];
    return getSignedUrl(
      target.client,
      new GetObjectCommand({ Bucket: target.name, Key: key, ResponseContentDisposition: 'inline' }),
      { expiresIn: options.ttlSeconds },
    );
  }

  /** A presigned PUT URL that also signs Content-Type and Content-Length. */
  getSignedUploadUrl(
    bucket: BucketId,
    key: string,
    options: { contentType: string; contentLength: number; ttlSeconds: number },
  ): Promise<string> {
    const target = this.buckets[bucket];
    return getSignedUrl(
      target.client,
      new PutObjectCommand({
        Bucket: target.name,
        Key: key,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      }),
      {
        expiresIn: options.ttlSeconds,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
  }
}
