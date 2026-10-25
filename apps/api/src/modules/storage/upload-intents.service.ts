import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { UploaderType, UploadPurpose } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { isValidStorageKey } from './storage-keys.js';
import {
  allowsContentType,
  matchesSignature,
  SIGNATURE_PROBE_BYTES,
  UPLOAD_RULES,
  UPLOAD_URL_TTL_SECONDS,
} from './storage.policy.js';
import { StorageService, type StoredObject } from './storage.service.js';

/** Who asked for an upload (only they can confirm it). */
export interface UploadRequester {
  type: UploaderType;
  id: string;
}

/** An upload a module wants to allow. */
export interface NewUploadIntent {
  purpose: UploadPurpose;
  /** Allocated by the owning module with StorageKeys. */
  key: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  requestedBy: UploadRequester;
}

/** What the client needs to upload: the signed URL and the headers to send. */
export interface UploadTicket {
  intentId: string;
  key: string;
  method: 'PUT';
  url: string;
  /** Headers the client must send unchanged (they are part of the signature). */
  headers: { 'Content-Type': string; 'Content-Length': string };
  expiresAt: Date;
}

/**
 * Direct uploads to storage (ADR-011): the server allocates the key and signs a PUT fixing type
 * and exact size; confirmation proves the object is what was declared before anyone uses it.
 */
@Injectable()
export class UploadIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Checks type, size and checksum format, records the intent and signs a PUT URL valid 15
   * minutes.
   */
  async create(input: NewUploadIntent): Promise<UploadTicket> {
    const rule = UPLOAD_RULES[input.purpose];
    const fields: Record<string, string[]> = {};
    if (!allowsContentType(rule, input.contentType))
      fields.contentType = ['This file type is not accepted.'];
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > rule.maxBytes
    ) {
      fields.sizeBytes = [`The file must be between 1 byte and ${rule.maxBytes} bytes.`];
    }
    if (!/^[0-9a-f]{64}$/.test(input.sha256))
      fields.sha256 = ['Expected a lower-case hex SHA-256.'];
    if (!isValidStorageKey(input.key) || !input.key.startsWith(rule.keyPrefix)) {
      throw new Error(`Key ${input.key} does not belong to ${input.purpose}`);
    }
    if (Object.keys(fields).length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'The upload is not acceptable.', { fields });
    }

    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);
    const intent = await this.prisma.storageUploadIntent.create({
      data: {
        bucket: rule.bucket,
        key: input.key,
        purpose: input.purpose,
        contentType: input.contentType,
        declaredSizeBytes: input.sizeBytes,
        declaredSha256: input.sha256,
        requestedByType: input.requestedBy.type,
        requestedById: input.requestedBy.id,
        expiresAt,
      },
    });
    const url = await this.storage.getSignedUploadUrl(rule.bucket, input.key, {
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      ttlSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return {
      intentId: intent.id,
      key: intent.key,
      method: 'PUT',
      url,
      headers: { 'Content-Type': input.contentType, 'Content-Length': String(input.sizeBytes) },
      expiresAt,
    };
  }

  /**
   * Checks the uploaded object: it exists, has the declared size (within the purpose limit) and
   * starts with the file signature of its type. A failing object is deleted.
   */
  async confirm(
    intentId: string,
    requestedBy: UploadRequester,
  ): Promise<StoredObject & { declaredSha256: string; purpose: UploadPurpose }> {
    const intent = await this.prisma.storageUploadIntent.findUnique({ where: { id: intentId } });
    if (
      !intent ||
      intent.requestedByType !== requestedBy.type ||
      intent.requestedById !== requestedBy.id
    ) {
      throw new DomainError('NOT_FOUND', 'Upload not found.');
    }
    if (intent.confirmedAt)
      throw new DomainError('UPLOAD_INVALID', 'This upload was already confirmed.');
    if (intent.expiresAt <= new Date())
      throw new DomainError('UPLOAD_EXPIRED', 'The upload window has closed.');

    const rule = UPLOAD_RULES[intent.purpose];
    const object = await this.storage.head(intent.bucket, intent.key);
    if (!object) throw new DomainError('UPLOAD_INVALID', 'The file has not been uploaded yet.');

    const reject = async (reason: string): Promise<never> => {
      await this.storage.delete(intent.bucket, intent.key);
      throw new DomainError('UPLOAD_INVALID', reason);
    };
    if (object.sizeBytes !== intent.declaredSizeBytes || object.sizeBytes > rule.maxBytes) {
      return reject('The uploaded file does not have the declared size.');
    }
    const head = await this.storage.download(intent.bucket, intent.key, {
      start: 0,
      end: Math.min(SIGNATURE_PROBE_BYTES, object.sizeBytes) - 1,
    });
    if (!matchesSignature(rule, intent.contentType, head)) {
      return reject('The uploaded file is not a valid file of the declared type.');
    }

    const { count } = await this.prisma.storageUploadIntent.updateMany({
      where: { id: intent.id, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    if (count !== 1) throw new DomainError('UPLOAD_INVALID', 'This upload was already confirmed.');
    return {
      ...object,
      contentType: intent.contentType,
      declaredSha256: intent.declaredSha256,
      purpose: intent.purpose,
    };
  }

  /** Deletes expired, unconfirmed intents and anything uploaded under them (hourly job). */
  async purgeExpired(): Promise<number> {
    const expired = await this.prisma.storageUploadIntent.findMany({
      where: { confirmedAt: null, expiresAt: { lt: new Date() } },
      select: { id: true, bucket: true, key: true },
      take: 500,
    });
    for (const intent of expired) {
      await this.storage.delete(intent.bucket, intent.key);
      await this.prisma.storageUploadIntent.delete({ where: { id: intent.id } });
    }
    return expired.length;
  }
}
