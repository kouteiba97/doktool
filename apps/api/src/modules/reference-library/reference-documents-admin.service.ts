import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import {
  Prisma,
  type ReferenceDocumentStatus,
  type ReferenceDocumentType,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import {
  SIGNED_READ_TTL,
  StorageKeys,
  StorageService,
  UploadIntentsService,
  type UploadTicket,
} from '../storage/index.js';
import { PDF_CONTENT_TYPE, PROCESS_FILE_JOB, suggestTitle } from './reference-library.policy.js';

/** What Admin Web declares before uploading a PDF. */
export interface UploadRequest {
  type: ReferenceDocumentType;
  fileName: string;
  sizeBytes: number;
  sha256: string;
}

/** Step 2 of « Ajouter un modèle ». */
export interface NewDocument {
  intentId: string;
  documentId: string;
  type: ReferenceDocumentType;
  titleFr: string;
  titleEn?: string | null;
  demoSample: boolean;
  status: 'ENABLED' | 'DISABLED';
  reason: string;
}

/** Display metadata changes. */
export interface DocumentPatch {
  titleFr?: string;
  titleEn?: string | null;
  demoSample?: boolean;
  reason: string;
}

/** Lifecycle actions and the statuses they move a document between (section 13). */
export const LIFECYCLE = {
  enable: { from: ['DISABLED'], to: 'ENABLED' },
  disable: { from: ['ENABLED'], to: 'DISABLED' },
  archive: { from: ['ENABLED', 'DISABLED'], to: 'ARCHIVED' },
  restore: { from: ['ARCHIVED'], to: 'DISABLED' },
} as const satisfies Record<
  string,
  { from: ReferenceDocumentStatus[]; to: ReferenceDocumentStatus }
>;

/** enable, disable, archive or restore. */
export type LifecycleAction = keyof typeof LIFECYCLE;

/**
 * Relations shown to Admin Web. Only ever used in reads outside transactions: with a write (an
 * implicit transaction) Prisma would query these relations in parallel on one connection.
 */
const DETAIL_INCLUDE = {
  currentFile: true,
  files: { orderBy: { version: 'desc' } },
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ReferenceDocumentInclude;

/** A model with its files and people, as Admin Web shows it. */
export type AdminDocumentRecord = Prisma.ReferenceDocumentGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

/** The fields recorded in audit entries of a model. */
const auditSnapshot = (document: {
  type: string;
  titleFr: string;
  titleEn: string | null;
  demoSample: boolean;
  status: string;
}) => ({
  type: document.type,
  titleFr: document.titleFr,
  titleEn: document.titleEn,
  demoSample: document.demoSample,
  status: document.status,
});

/**
 * Super Admin management of Ordonnances and Certificates (section 13). The admin never authors
 * clinical content: the PDF is the content; every mutation needs a reason and is audited.
 */
@Injectable()
export class ReferenceDocumentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intents: UploadIntentsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  /** Step 1 of a new model: a signed upload for version 1 under a freshly allocated id. */
  async requestUpload(
    admin: AdminPrincipal,
    request: UploadRequest,
  ): Promise<{
    documentId: string;
    version: number;
    suggestedTitle: string;
    upload: UploadTicket;
  }> {
    const documentId = randomUUID();
    const upload = await this.ticket(admin, request.type, documentId, 1, request);
    return { documentId, version: 1, suggestedTitle: suggestTitle(request.fileName), upload };
  }

  /** Step 2: validates the upload and creates the model; processing sets its final status. */
  async create(
    admin: AdminPrincipal,
    input: NewDocument,
    client: ClientInfo,
  ): Promise<AdminDocumentRecord> {
    const stored = await this.intents.confirm(input.intentId, { type: 'ADMIN', id: admin.adminId });
    if (
      stored.key !==
      StorageKeys.referenceDocument(input.type, input.documentId, 1, stored.declaredSha256)
    ) {
      throw new DomainError('VALIDATION_FAILED', 'The upload does not belong to this model.');
    }
    const fileId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.referenceDocument.create({
        data: {
          id: input.documentId,
          type: input.type,
          titleFr: input.titleFr.trim(),
          titleEn: input.titleEn?.trim() || null,
          demoSample: input.demoSample,
          status: 'PROCESSING',
          statusAfterProcessing: input.status,
          createdById: admin.adminId,
          updatedById: admin.adminId,
        },
      });
      await tx.referenceDocumentFile.create({
        data: {
          id: fileId,
          documentId: input.documentId,
          version: 1,
          storageKey: stored.key,
          declaredSha256: stored.declaredSha256,
          sizeBytes: stored.sizeBytes,
          uploadedById: admin.adminId,
        },
      });
    });
    // Read after commit: a multi-relation include inside a transaction makes Prisma run parallel
    // queries on the transaction's single connection.
    const document = await this.require(input.documentId);
    await this.record(admin, client, 'reference.created', document.id, {
      after: {
        ...auditSnapshot(document),
        requestedStatus: input.status,
        fileVersion: 1,
        sizeBytes: stored.sizeBytes,
      },
      reason: input.reason,
    });
    await this.jobs.enqueue(PROCESS_FILE_JOB, { fileId });
    return document;
  }

  /** A signed upload for the next version of an existing model. */
  async requestReplacement(
    admin: AdminPrincipal,
    documentId: string,
    request: Omit<UploadRequest, 'type'>,
  ): Promise<{ documentId: string; version: number; upload: UploadTicket }> {
    const document = await this.require(documentId);
    if (document.status === 'ARCHIVED') {
      throw new DomainError('INVALID_STATE', 'Restore the model before replacing its PDF.');
    }
    const version = (document.files[0]?.version ?? 0) + 1;
    const upload = await this.ticket(admin, document.type, documentId, version, {
      ...request,
      type: document.type,
    });
    return { documentId, version, upload };
  }

  /** New file version under the same id; favorites keep working; the current file moves once processed. */
  async replace(
    admin: AdminPrincipal,
    documentId: string,
    input: { intentId: string; version: number; reason: string },
    client: ClientInfo,
  ): Promise<AdminDocumentRecord> {
    const document = await this.require(documentId);
    const stored = await this.intents.confirm(input.intentId, { type: 'ADMIN', id: admin.adminId });
    const expectedKey = StorageKeys.referenceDocument(
      document.type,
      documentId,
      input.version,
      stored.declaredSha256,
    );
    if (stored.key !== expectedKey)
      throw new DomainError('VALIDATION_FAILED', 'The upload does not belong to this model.');

    const fileId = randomUUID();
    try {
      await this.prisma.referenceDocumentFile.create({
        data: {
          id: fileId,
          documentId,
          version: input.version,
          storageKey: stored.key,
          declaredSha256: stored.declaredSha256,
          sizeBytes: stored.sizeBytes,
          uploadedById: admin.adminId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError(
          'VERSION_CONFLICT',
          'Another replacement created this version first.',
        );
      }
      throw error;
    }
    await this.prisma.referenceDocument.update({
      where: { id: documentId },
      data: { updatedById: admin.adminId },
    });
    await this.record(admin, client, 'reference.file.replaced', documentId, {
      before: { fileVersion: document.currentFile?.version ?? null },
      after: { fileVersion: input.version, sizeBytes: stored.sizeBytes },
      reason: input.reason,
    });
    await this.jobs.enqueue(PROCESS_FILE_JOB, { fileId });
    return this.detail(documentId);
  }

  /** Display metadata only; the PDF is never touched (section 13). */
  async update(
    admin: AdminPrincipal,
    documentId: string,
    patch: DocumentPatch,
    client: ClientInfo,
  ): Promise<AdminDocumentRecord> {
    const before = await this.require(documentId);
    await this.prisma.referenceDocument.update({
      where: { id: documentId },
      data: {
        ...(patch.titleFr !== undefined ? { titleFr: patch.titleFr.trim() } : {}),
        ...(patch.titleEn !== undefined ? { titleEn: patch.titleEn?.trim() || null } : {}),
        ...(patch.demoSample !== undefined ? { demoSample: patch.demoSample } : {}),
        updatedById: admin.adminId,
      },
    });
    const updated = await this.require(documentId);
    await this.record(admin, client, 'reference.updated', documentId, {
      before: auditSnapshot(before),
      after: auditSnapshot(updated),
      reason: patch.reason,
    });
    return updated;
  }

  /** Enables, disables, archives or restores a model; enabling needs a processed PDF. */
  async changeStatus(
    admin: AdminPrincipal,
    documentId: string,
    action: LifecycleAction,
    reason: string,
    client: ClientInfo,
  ): Promise<AdminDocumentRecord> {
    const document = await this.require(documentId);
    const rule = LIFECYCLE[action];
    if (!(rule.from as readonly ReferenceDocumentStatus[]).includes(document.status)) {
      throw new DomainError(
        'INVALID_STATE',
        `Cannot ${action} a model that is ${document.status}.`,
      );
    }
    if (rule.to === 'ENABLED' && !document.currentFileId) {
      throw new DomainError('INVALID_STATE', 'The model has no processed PDF yet.');
    }
    await this.prisma.referenceDocument.update({
      where: { id: documentId },
      data: { status: rule.to, updatedById: admin.adminId },
    });
    const updated = await this.require(documentId);
    await this.record(admin, client, `reference.${action}d`, documentId, {
      before: { status: document.status },
      after: { status: updated.status },
      reason,
    });
    return updated;
  }

  /** Admin list: archived models only when asked for (section 13). */
  list(filter: {
    type?: ReferenceDocumentType;
    status?: ReferenceDocumentStatus;
  }): Promise<AdminDocumentRecord[]> {
    return this.prisma.referenceDocument.findMany({
      where: {
        ...(filter.type ? { type: filter.type } : {}),
        status: filter.status ?? { not: 'ARCHIVED' },
      },
      orderBy: [{ type: 'asc' }, { titleFr: 'asc' }],
      include: DETAIL_INCLUDE,
    });
  }

  /** One model with all its files. */
  async detail(documentId: string): Promise<AdminDocumentRecord> {
    return this.require(documentId);
  }

  /** Preview of any stored version for `library.read` holders (views are not logged, section 13). */
  async previewUrl(documentId: string, fileId: string): Promise<{ url: string; expiresAt: Date }> {
    const file = await this.prisma.referenceDocumentFile.findFirst({
      where: { id: fileId, documentId },
    });
    if (!file || !(await this.storage.head('CONTENT', file.storageKey))) {
      throw new DomainError('NOT_FOUND', 'File not found.');
    }
    const ttlSeconds = SIGNED_READ_TTL.referenceDocument;
    return {
      url: await this.storage.getSignedReadUrl('CONTENT', file.storageKey, { ttlSeconds }),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  /** Loads a model or answers NOT_FOUND. */
  private async require(documentId: string): Promise<AdminDocumentRecord> {
    const document = await this.prisma.referenceDocument.findUnique({
      where: { id: documentId },
      include: DETAIL_INCLUDE,
    });
    if (!document) throw new DomainError('NOT_FOUND', 'Reference model not found.');
    return document;
  }

  /** Signs the upload of one PDF version under its immutable key. */
  private ticket(
    admin: AdminPrincipal,
    type: ReferenceDocumentType,
    documentId: string,
    version: number,
    request: UploadRequest,
  ): Promise<UploadTicket> {
    const sha256 = request.sha256.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new DomainError('VALIDATION_FAILED', 'Expected the SHA-256 of the PDF.', {
        fields: { sha256: ['Expected a hex SHA-256.'] },
      });
    }
    return this.intents.create({
      purpose: 'REFERENCE_DOCUMENT',
      key: StorageKeys.referenceDocument(type, documentId, version, sha256),
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: request.sizeBytes,
      sha256,
      requestedBy: { type: 'ADMIN', id: admin.adminId },
    });
  }

  /** Audit entry of a library change. */
  private record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    documentId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue; reason: string },
  ): Promise<void> {
    return this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action,
      entityType: 'ReferenceDocument',
      entityId: documentId,
      before: change.before,
      after: change.after,
      reason: change.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
