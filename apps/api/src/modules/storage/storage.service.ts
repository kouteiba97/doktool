import type { StorageBucket } from '../../generated/prisma/enums.js';

export type BucketId = StorageBucket;

export interface StoredObject {
  bucket: BucketId;
  key: string;
  sizeBytes: number;
  contentType: string | null;
  etag: string | null;
}

export interface UploadInput {
  bucket: BucketId;
  key: string;
  body: Uint8Array;
  contentType: string;
}

/** Inclusive byte range, as in an HTTP `Range: bytes=start-end` header. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * The only way the backend touches file bytes (ADR-002, ADR-011). PostgreSQL keeps metadata and
 * keys; objects live in R2 (or local files in development). Keys are immutable: an upload to an
 * existing key fails, and a replacement writes a new key.
 */
export abstract class StorageService {
  /** Stores bytes under a new key; fails if the key already exists. */
  abstract upload(input: UploadInput): Promise<StoredObject>;

  abstract delete(bucket: BucketId, key: string): Promise<void>;

  /** Object metadata, or null when it does not exist. */
  abstract head(bucket: BucketId, key: string): Promise<StoredObject | null>;

  /** Object bytes, optionally a range of them (signature checks, hashing jobs). */
  abstract download(bucket: BucketId, key: string, range?: ByteRange): Promise<Uint8Array>;

  /** Short-lived URL to read an object inline. */
  abstract getSignedReadUrl(
    bucket: BucketId,
    key: string,
    options: { ttlSeconds: number },
  ): Promise<string>;

  /**
   * Short-lived URL to PUT exactly `contentLength` bytes of `contentType` at `key`. Both headers
   * are part of the signature, so the storage refuses any other size or type.
   */
  abstract getSignedUploadUrl(
    bucket: BucketId,
    key: string,
    options: { contentType: string; contentLength: number; ttlSeconds: number },
  ): Promise<string>;

  /**
   * Writes a new version under `newKey` and keeps `oldKey`, so every past version stays
   * retrievable (audit §8). The caller moves its pointer to the new key.
   */
  async replace(input: UploadInput & { oldKey: string }): Promise<StoredObject> {
    if (!(await this.head(input.bucket, input.oldKey))) {
      throw new Error(`Cannot replace missing object ${input.bucket}/${input.oldKey}`);
    }
    return this.upload(input);
  }
}
