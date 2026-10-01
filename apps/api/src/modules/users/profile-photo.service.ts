import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { DomainError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import {
  SIGNED_READ_TTL,
  StorageKeys,
  StorageService,
  UploadIntentsService,
  type UploadTicket,
} from '../storage/index.js';

/** Stored photo size (square, cover) — enough for the profile header on any screen density. */
const PHOTO_SIZE = 512;
const EXTENSIONS: Record<string, 'jpg' | 'png'> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const UPLOAD_RATE = { name: 'profile.photo', limit: 10, windowSeconds: 3600 };

/**
 * Profile photos (ScreenProfileMobile): the original goes to storage through a signed upload, then
 * the API re-encodes it to a 512 px WebP — which drops EXIF, GPS and every other metadata — stores
 * that under a new key and deletes the original.
 */
@Injectable()
export class ProfilePhotoService {
  private readonly logger = new Logger(ProfilePhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly intents: UploadIntentsService,
    private readonly limiter: RateLimiter,
  ) {}

  async requestUpload(
    userId: string,
    input: { contentType: string; sizeBytes: number; sha256: string },
  ): Promise<{ imageId: string; upload: UploadTicket }> {
    const extension = EXTENSIONS[input.contentType];
    if (!extension) {
      throw new DomainError('VALIDATION_FAILED', 'The upload is not acceptable.', {
        fields: { contentType: ['Send a JPEG or PNG photo.'] },
      });
    }
    await this.limiter.hit(UPLOAD_RATE, userId);
    const imageId = randomUUID();
    const upload = await this.intents.create({
      purpose: 'PROFILE_IMAGE',
      key: StorageKeys.profileImageOriginal(userId, imageId, extension),
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      requestedBy: { type: 'USER', id: userId },
    });
    return { imageId, upload };
  }

  /** Confirms the upload, re-encodes it and makes it the profile photo. */
  async attach(userId: string, input: { intentId: string; imageId: string }): Promise<void> {
    const stored = await this.intents.confirm(input.intentId, { type: 'USER', id: userId });
    const extension = EXTENSIONS[stored.contentType ?? ''];
    const expected = extension
      ? StorageKeys.profileImageOriginal(userId, input.imageId, extension)
      : null;
    if (stored.purpose !== 'PROFILE_IMAGE' || stored.key !== expected) {
      await this.storage.delete('CONTENT', stored.key);
      throw new DomainError(
        'UPLOAD_INVALID',
        'This upload is not a profile photo of this account.',
      );
    }

    let encoded: Buffer;
    try {
      const original = await this.storage.download('CONTENT', stored.key);
      encoded = await sharp(original, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new DomainError('UPLOAD_INVALID', 'The photo could not be read.');
    } finally {
      await this.storage.delete('CONTENT', stored.key);
    }

    const key = StorageKeys.profileImage(userId, randomUUID());
    await this.storage.upload({ bucket: 'CONTENT', key, body: encoded, contentType: 'image/webp' });
    const previous = await this.replaceKey(userId, key);
    if (previous) await this.deleteObject(previous);
  }

  async remove(userId: string): Promise<void> {
    const previous = await this.replaceKey(userId, null);
    if (previous) await this.deleteObject(previous);
  }

  /** A signed URL for the photo (1 hour), or null without one. */
  async urlOf(key: string | null): Promise<string | null> {
    if (!key) return null;
    return this.storage.getSignedReadUrl('CONTENT', key, {
      ttlSeconds: SIGNED_READ_TTL.profileImage,
    });
  }

  private async replaceKey(userId: string, key: string | null): Promise<string | null> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarStorageKey: true },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarStorageKey: key } });
    return user.avatarStorageKey;
  }

  /** Deletes a photo no row points to any more; a failure is logged with the key, not raised. */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.storage.delete('CONTENT', key);
    } catch (error) {
      this.logger.error(`Could not delete profile photo ${key}`, error);
    }
  }
}
