import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import {
  Prisma,
  type ProfessionalType,
  type VerificationType,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import { AuditService } from '../audit/index.js';
import { StorageKeys, UploadIntentsService, type UploadTicket } from '../storage/index.js';
import { UsersService } from '../users/index.js';
import {
  CASE_SELECT,
  type CaseRecord,
  caseTarget,
  detailsOf,
  LATEST_FIRST,
  stepStates,
} from './verification-cases.js';
import { VerificationFilesService } from './verification-files.service.js';
import {
  canTarget,
  checkDetails,
  EXTENSIONS,
  REJECTIONS_BEFORE_APPEAL,
  RENEWAL_WINDOW_DAYS,
  type StepType,
  stepsFor,
} from './verification.policy.js';

const TYPES: VerificationType[] = ['IDENTITY', 'PROFESSIONAL_STATUS', 'STUDENT_STATUS'];
const OPEN = new Set(['NOT_STARTED', 'SUBMITTED', 'IN_REVIEW', 'APPEALED']);
const DECIDED = new Set(['VERIFIED', 'REJECTED', 'EXPIRED']);
/** Upload requests per person and hour (ADR-009 style limit on signed-URL issuance). */
const UPLOAD_RATE = { name: 'verification.upload', limit: 30, windowSeconds: 3600 };

export interface CaseState {
  record: CaseRecord;
  canAppeal: boolean;
}

export interface TypeState {
  type: VerificationType;
  /** Whether a new case of this type may be started now (for the person's current type). */
  canStart: boolean;
  latest: CaseState | null;
}

export interface VerificationOverview {
  professionalType: ProfessionalType | null;
  types: TypeState[];
}

export interface DetailsInput {
  documentKind?: string;
  orderNumber?: string;
  specialtyId?: string;
  institutionId?: string;
  universityId?: string;
  residencyYear?: number;
  academicYear?: number;
}

export interface UploadRequest {
  stepType: StepType;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * The person's side of verification (section 06): one case per type, prepared step by step,
 * submitted once, then decided by a reviewer. Identity and status are separate cases.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly intents: UploadIntentsService,
    private readonly files: VerificationFilesService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
  ) {}

  async overview(userId: string): Promise<VerificationOverview> {
    const professionalType = await this.users.professionalTypeOf(userId);
    const types: TypeState[] = [];
    for (const type of TYPES) {
      const latest = await this.latest(userId, type);
      const canStart =
        professionalType !== null &&
        this.startRefusal(
          type,
          professionalType,
          this.defaultTarget(type, professionalType),
          latest,
        ) === null;
      types.push({
        type,
        canStart,
        latest: latest ? { record: latest, canAppeal: await this.canAppeal(latest) } : null,
      });
    }
    return { professionalType, types };
  }

  async start(
    userId: string,
    type: VerificationType,
    requestedTarget: ProfessionalType | undefined,
  ): Promise<CaseState> {
    const current = await this.users.professionalTypeOf(userId);
    if (current === null) throw new DomainError('INVALID_STATE', 'Choose who you are first.');
    const target = this.resolveTarget(type, current, requestedTarget);
    const refusal = this.startRefusal(type, current, target, await this.latest(userId, type));
    if (refusal) throw new DomainError('INVALID_STATE', refusal);
    try {
      const record = await this.prisma.verificationCase.create({
        data: {
          userId,
          type,
          declaredDetails: target && type !== 'IDENTITY' ? { professionalType: target } : {},
        },
        select: CASE_SELECT,
      });
      return { record, canAppeal: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('INVALID_STATE', 'A case of this type is already open.');
      }
      throw error;
    }
  }

  /** Replaces the declared details of a case being prepared; they must be complete and valid. */
  async saveDetails(userId: string, caseId: string, input: DetailsInput): Promise<CaseState> {
    const record = await this.preparing(userId, caseId);
    const target = caseTarget(record);
    const raw: Record<string, unknown> = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
    );
    if (target !== null) raw.professionalType = target;
    await this.assertDetails(userId, record, raw);
    const updated = await this.prisma.verificationCase.update({
      where: { id: record.id },
      data: { declaredDetails: raw as Prisma.InputJsonObject },
      select: CASE_SELECT,
    });
    return { record: updated, canAppeal: false };
  }

  /** Signs a direct upload for one step (private bucket, 15 minutes, exact size and type). */
  async requestUpload(
    userId: string,
    caseId: string,
    input: UploadRequest,
  ): Promise<{ documentId: string; stepType: StepType; upload: UploadTicket }> {
    const record = await this.preparing(userId, caseId);
    this.assertStep(record, input.stepType);
    const extension = EXTENSIONS[input.contentType];
    if (!extension) {
      throw new DomainError('VALIDATION_FAILED', 'The upload is not acceptable.', {
        fields: { contentType: ['Send a JPEG or PNG photo, or a PDF.'] },
      });
    }
    await this.limiter.hit(UPLOAD_RATE, userId);
    const documentId = randomUUID();
    const upload = await this.intents.create({
      purpose: 'VERIFICATION_DOCUMENT',
      key: StorageKeys.verificationDocument(userId, caseId, documentId, extension),
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      requestedBy: { type: 'USER', id: userId },
    });
    return { documentId, stepType: input.stepType, upload };
  }

  /** Confirms an uploaded file and attaches it to its step, replacing the previous file of that step. */
  async attach(
    userId: string,
    caseId: string,
    input: { intentId: string; documentId: string; stepType: StepType },
  ): Promise<CaseState> {
    const record = await this.preparing(userId, caseId);
    this.assertStep(record, input.stepType);
    const stored = await this.intents.confirm(input.intentId, { type: 'USER', id: userId });
    const extension = EXTENSIONS[stored.contentType ?? ''];
    const expectedKey = extension
      ? StorageKeys.verificationDocument(userId, caseId, input.documentId, extension)
      : null;
    if (stored.purpose !== 'VERIFICATION_DOCUMENT' || stored.key !== expectedKey) {
      await this.files.deleteObject(stored.key);
      throw new DomainError('UPLOAD_INVALID', 'This upload does not belong to this step.');
    }

    const replaced = await this.prisma.$transaction(async (tx) => {
      await this.lockPreparing(tx, caseId);
      const previous = await tx.verificationDocument.findUnique({
        where: { caseId_stepType: { caseId, stepType: input.stepType } },
        select: { id: true, storageKey: true },
      });
      if (previous) await tx.verificationDocument.delete({ where: { id: previous.id } });
      await tx.verificationDocument.create({
        data: {
          id: input.documentId,
          caseId,
          stepType: input.stepType,
          storageKey: stored.key,
          mimeType: stored.contentType ?? '',
          sizeBytes: stored.sizeBytes,
          sha256: stored.declaredSha256,
        },
      });
      return previous;
    });
    if (replaced) await this.files.deleteObject(replaced.storageKey);
    return { record: await this.load(caseId), canAppeal: false };
  }

  async removeDocument(userId: string, caseId: string, documentId: string): Promise<CaseState> {
    const record = await this.preparing(userId, caseId);
    const document = record.documents.find((candidate) => candidate.id === documentId);
    if (!document) throw new DomainError('NOT_FOUND', 'Document not found.');
    await this.prisma.$transaction(async (tx) => {
      await this.lockPreparing(tx, caseId);
      await tx.verificationDocument.delete({ where: { id: documentId } });
    });
    await this.files.deleteObject(document.storageKey);
    return { record: await this.load(caseId), canAppeal: false };
  }

  /** « Envoyer »: the details and every required step must be present. */
  async submit(userId: string, caseId: string, client: ClientInfo): Promise<CaseState> {
    const record = await this.preparing(userId, caseId);
    await this.assertDetails(userId, record, detailsOf(record));
    const missing = stepStates(record).filter((step) => step.required && !step.provided);
    if (missing.length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'Some documents are missing.', {
        fields: { steps: missing.map((step) => step.stepType) },
      });
    }
    const { count } = await this.prisma.verificationCase.updateMany({
      where: { id: caseId, status: 'NOT_STARTED' },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'This case was already sent.');
    await this.record(
      userId,
      client,
      'verification.submitted',
      caseId,
      { status: 'NOT_STARTED' },
      { status: 'SUBMITTED' },
    );
    return { record: await this.load(caseId), canAppeal: false };
  }

  /** Appeal after a second rejection; a different reviewer decides (section 06). */
  async appeal(userId: string, caseId: string, client: ClientInfo): Promise<CaseState> {
    const record = await this.owned(userId, caseId);
    if (!(await this.canAppeal(record))) {
      throw new DomainError('INVALID_STATE', 'This decision cannot be appealed.');
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.verificationCase.updateMany({
        where: { id: caseId, status: 'REJECTED', appealedAt: null },
        data: {
          status: 'APPEALED',
          appealedAt: now,
          rejectedById: record.reviewerId,
          reviewerId: null,
        },
      });
      if (count !== 1) throw new DomainError('INVALID_STATE', 'This decision cannot be appealed.');
      await tx.verificationDocument.updateMany({ where: { caseId }, data: { purgeAfter: null } });
      return tx.verificationCase.findUniqueOrThrow({ where: { id: caseId }, select: CASE_SELECT });
    });
    await this.record(
      userId,
      client,
      'verification.appealed',
      caseId,
      { status: 'REJECTED' },
      { status: 'APPEALED' },
    );
    return { record: updated, canAppeal: false };
  }

  /** Deletion request after the decision (section 06): files and declared details go now. */
  async eraseDocuments(userId: string, caseId: string, client: ClientInfo): Promise<CaseState> {
    const record = await this.owned(userId, caseId);
    if (!DECIDED.has(record.status)) {
      throw new DomainError('INVALID_STATE', 'Documents can be deleted once the case is decided.');
    }
    const deleted = await this.files.eraseCase(caseId);
    await this.record(
      userId,
      client,
      'verification.documents_erased',
      caseId,
      { documents: record.documents.length },
      { documents: 0, deleted },
    );
    const reloaded = await this.load(caseId);
    return { record: reloaded, canAppeal: await this.canAppeal(reloaded) };
  }

  // ───────────────────────────────── helpers ─────────────────────────────────

  private latest(userId: string, type: VerificationType): Promise<CaseRecord | null> {
    return this.prisma.verificationCase.findFirst({
      where: { userId, type },
      orderBy: LATEST_FIRST,
      select: CASE_SELECT,
    });
  }

  private load(caseId: string): Promise<CaseRecord> {
    return this.prisma.verificationCase.findUniqueOrThrow({
      where: { id: caseId },
      select: CASE_SELECT,
    });
  }

  private async owned(userId: string, caseId: string): Promise<CaseRecord> {
    const record = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
      select: CASE_SELECT,
    });
    if (!record || record.userId !== userId) throw new DomainError('NOT_FOUND', 'Case not found.');
    return record;
  }

  private async preparing(userId: string, caseId: string): Promise<CaseRecord> {
    const record = await this.owned(userId, caseId);
    if (record.status !== 'NOT_STARTED') {
      throw new DomainError('INVALID_STATE', 'This case was already sent.');
    }
    return record;
  }

  /** Locks the case row for the transaction and checks it is still being prepared. */
  private async lockPreparing(tx: Prisma.TransactionClient, caseId: string): Promise<void> {
    const { count } = await tx.verificationCase.updateMany({
      where: { id: caseId, status: 'NOT_STARTED' },
      data: { updatedAt: new Date() },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'This case was already sent.');
  }

  private assertStep(record: CaseRecord, stepType: StepType): void {
    if (!stepsFor(record.type, caseTarget(record)).some((rule) => rule.stepType === stepType)) {
      throw new DomainError('VALIDATION_FAILED', 'This step does not belong to this case.', {
        fields: { stepType: ['Not a step of this case.'] },
      });
    }
  }

  private async assertDetails(
    userId: string,
    record: CaseRecord,
    raw: Record<string, unknown>,
  ): Promise<void> {
    const target = caseTarget(record);
    const check = checkDetails(record.type, target, raw);
    if (!check.ok)
      throw new DomainError('VALIDATION_FAILED', 'Invalid details.', { fields: check.fields });
    const details = check.details;
    if ('documentKind' in details && details.documentKind === 'STUDENT_CARD') {
      if ((await this.users.professionalTypeOf(userId)) !== 'STUDENT') {
        throw new DomainError('VALIDATION_FAILED', 'Invalid details.', {
          fields: { documentKind: ['A student card proves identity for medical students only.'] },
        });
      }
    }
    if ('professionalType' in details) {
      await this.users.assertProfessionalReferences({
        professionalType: details.professionalType,
        specialtyId: 'specialtyId' in details ? details.specialtyId : undefined,
        institutionId: 'institutionId' in details ? details.institutionId : undefined,
        universityId: 'universityId' in details ? details.universityId : undefined,
      });
    }
  }

  private defaultTarget(
    type: VerificationType,
    current: ProfessionalType,
  ): ProfessionalType | null {
    return type === 'IDENTITY' ? null : current;
  }

  private resolveTarget(
    type: VerificationType,
    current: ProfessionalType,
    requested: ProfessionalType | undefined,
  ): ProfessionalType | null {
    if (type === 'IDENTITY') return null;
    if (type === 'STUDENT_STATUS') {
      if (current !== 'STUDENT') {
        throw new DomainError(
          'INVALID_STATE',
          'Student status is proved by medical students only.',
        );
      }
      return 'STUDENT';
    }
    const target = requested ?? current;
    if (target === 'STUDENT') {
      throw new DomainError('VALIDATION_FAILED', 'Choose Doctor or Resident.', {
        fields: { professionalType: ['Doctor or Resident.'] },
      });
    }
    if (!canTarget(current, target)) {
      throw new DomainError('INVALID_STATE', 'A status case cannot move to an earlier role.');
    }
    return target;
  }

  /** Why a new case may not start now, or null when it may. */
  private startRefusal(
    type: VerificationType,
    current: ProfessionalType,
    target: ProfessionalType | null,
    latest: CaseRecord | null,
  ): string | null {
    if (type === 'STUDENT_STATUS' && current !== 'STUDENT') {
      return 'Student status is proved by medical students only.';
    }
    if (type === 'PROFESSIONAL_STATUS' && target === 'STUDENT') return 'Choose Doctor or Resident.';
    if (!latest) return null;
    if (OPEN.has(latest.status)) return 'A case of this type is already open.';
    if (latest.status !== 'VERIFIED') return null;
    if (type !== 'IDENTITY' && caseTarget(latest) !== target) return null;
    const renewalFrom = Date.now() + RENEWAL_WINDOW_DAYS * 24 * 3600 * 1000;
    return latest.expiresAt && latest.expiresAt.getTime() <= renewalFrom
      ? null
      : 'Already verified.';
  }

  private async canAppeal(record: CaseRecord): Promise<boolean> {
    if (record.status !== 'REJECTED' || record.appealedAt || !record.reviewerId) return false;
    if (record.documents.length === 0) return false;
    const newer = await this.prisma.verificationCase.count({
      where: { userId: record.userId, type: record.type, createdAt: { gt: record.createdAt } },
    });
    if (newer > 0) return false;
    const rejections = await this.prisma.verificationCase.count({
      where: { userId: record.userId, type: record.type, status: 'REJECTED' },
    });
    return rejections >= REJECTIONS_BEFORE_APPEAL;
  }

  private record(
    userId: string,
    client: ClientInfo,
    action: string,
    caseId: string,
    before: Prisma.InputJsonObject,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record({
      actorType: 'USER',
      actorId: userId,
      action,
      entityType: 'VerificationCase',
      entityId: caseId,
      before,
      after,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
