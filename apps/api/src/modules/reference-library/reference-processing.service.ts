import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from '@cantoo/pdf-lib';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditService } from '../audit/index.js';
import { StorageService } from '../storage/index.js';

type Outcome =
  { status: 'READY'; sha256: string; pageCount: number } | { status: 'FAILED'; error: string };

/**
 * Turns an uploaded PDF into a usable file version: verifies the declared checksum, counts pages,
 * then makes it the document's current file. A new document takes the status the admin chose;
 * a failed first file leaves the document DISABLED (admin state "PDF unavailable").
 */
@Injectable()
export class ReferenceProcessingService {
  private readonly logger = new Logger(ReferenceProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async process(fileId: string): Promise<void> {
    const file = await this.prisma.referenceDocumentFile.findUnique({ where: { id: fileId } });
    if (!file || file.processingStatus !== 'PENDING') return;

    const outcome = await this.inspect(file.storageKey, file.declaredSha256);
    const now = new Date();
    const applied = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.referenceDocumentFile.updateMany({
        where: { id: file.id, processingStatus: 'PENDING' },
        data:
          outcome.status === 'READY'
            ? {
                processingStatus: 'READY',
                sha256: outcome.sha256,
                pageCount: outcome.pageCount,
                processedAt: now,
              }
            : { processingStatus: 'FAILED', processingError: outcome.error, processedAt: now },
      });
      if (claimed.count !== 1) return false;

      // Sequential reads: a relation include here would run parallel queries on the
      // transaction connection.
      const document = await tx.referenceDocument.findUniqueOrThrow({
        where: { id: file.documentId },
      });
      const currentFile = document.currentFileId
        ? await tx.referenceDocumentFile.findUniqueOrThrow({
            where: { id: document.currentFileId },
            select: { version: true },
          })
        : null;
      if (outcome.status === 'READY') {
        const newer = !currentFile || currentFile.version < file.version;
        if (newer) {
          await tx.referenceDocument.update({
            where: { id: document.id },
            data: {
              currentFileId: file.id,
              ...(document.status === 'PROCESSING'
                ? {
                    status: document.statusAfterProcessing ?? 'DISABLED',
                    statusAfterProcessing: null,
                  }
                : {}),
            },
          });
        }
      } else if (document.status === 'PROCESSING' && !document.currentFileId) {
        await tx.referenceDocument.update({
          where: { id: document.id },
          data: { status: 'DISABLED', statusAfterProcessing: null },
        });
      }
      return true;
    });
    if (!applied) return;

    await this.audit.record({
      actorType: 'SYSTEM',
      actorId: null,
      action: outcome.status === 'READY' ? 'reference.file.processed' : 'reference.file.failed',
      entityType: 'ReferenceDocumentFile',
      entityId: file.id,
      after:
        outcome.status === 'READY'
          ? { documentId: file.documentId, version: file.version, pageCount: outcome.pageCount }
          : { documentId: file.documentId, version: file.version, error: outcome.error },
    });
  }

  /** Processes files still pending (the minute sweep, in case a queued job was lost). */
  async processPending(limit = 20): Promise<void> {
    const pending = await this.prisma.referenceDocumentFile.findMany({
      where: { processingStatus: 'PENDING' },
      orderBy: { uploadedAt: 'asc' },
      select: { id: true },
      take: limit,
    });
    for (const { id } of pending) {
      try {
        await this.process(id);
      } catch (error) {
        this.logger.error(
          `Processing ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async inspect(storageKey: string, declaredSha256: string): Promise<Outcome> {
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.download('CONTENT', storageKey);
    } catch {
      return { status: 'FAILED', error: 'The uploaded file cannot be read from storage.' };
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== declaredSha256) {
      return {
        status: 'FAILED',
        error: 'The file checksum does not match the one declared before upload.',
      };
    }
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const pageCount = pdf.getPageCount();
      if (pageCount < 1) return { status: 'FAILED', error: 'The PDF has no pages.' };
      return { status: 'READY', sha256, pageCount };
    } catch {
      return { status: 'FAILED', error: 'The file is not a readable PDF.' };
    }
  }
}
