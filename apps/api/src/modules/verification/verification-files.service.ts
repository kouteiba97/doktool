import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { StorageService } from '../storage/index.js';

/** Deletes verification files: the object in the private bucket first, then its row. */
@Injectable()
export class VerificationFilesService {
  private readonly logger = new Logger(VerificationFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Deletes every document of a case and clears its declared details. Returns the count deleted. */
  async eraseCase(caseId: string): Promise<number> {
    const documents = await this.prisma.verificationDocument.findMany({
      where: { caseId },
      select: { id: true, storageKey: true },
    });
    for (const document of documents) await this.deleteDocument(document);
    await this.prisma.verificationCase.update({
      where: { id: caseId },
      data: { declaredDetails: {} },
    });
    return documents.length;
  }

  /**
   * Deletes one document: the stored object first, then its row (so a failure leaves the row to
   * retry).
   */
  async deleteDocument(document: { id: string; storageKey: string }): Promise<void> {
    await this.storage.delete('PRIVATE', document.storageKey);
    await this.prisma.verificationDocument.deleteMany({ where: { id: document.id } });
  }

  /**
   * Deletes the object of a replaced or removed document whose row is already gone. No row points
   * to it any more, so a failure is logged with the key for manual cleanup instead of failing the
   * person's request.
   */
  async deleteObject(storageKey: string): Promise<void> {
    try {
      await this.storage.delete('PRIVATE', storageKey);
    } catch (error) {
      this.logger.error(`Could not delete replaced verification file ${storageKey}`, error);
    }
  }
}
