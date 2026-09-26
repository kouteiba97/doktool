import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type {
  Prisma,
  VerificationStatus,
  VerificationType,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AdminAccountsService, type AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { NotificationsService } from '../notifications/index.js';
import { SIGNED_READ_TTL, StorageService } from '../storage/index.js';
import { UsersService } from '../users/index.js';
import { CASE_SELECT, type CaseRecord, caseTarget, detailsOf } from './verification-cases.js';
import {
  addMonths,
  checkDetails,
  DOCUMENT_RETENTION_MONTHS,
  maskOrderNumber,
  type RejectionReason,
} from './verification.policy.js';

const QUEUE_DEFAULT: VerificationStatus[] = ['SUBMITTED', 'APPEALED', 'IN_REVIEW'];
const QUEUE_PAGE = 50;

export interface QueueFilter {
  status?: VerificationStatus;
  type?: VerificationType;
  cursor?: string;
}

const QUEUE_SELECT = {
  id: true,
  type: true,
  status: true,
  submittedAt: true,
  appealedAt: true,
  declaredDetails: true,
  reviewerId: true,
  userId: true,
} satisfies Prisma.VerificationCaseSelect;

export type QueueRecord = Prisma.VerificationCaseGetPayload<{ select: typeof QUEUE_SELECT }> & {
  reviewer: { id: string; fullName: string } | null;
  user: { id: string; firstName: string; lastName: string };
  /** Declared specialty (professional status) or university (student status), by name. */
  specialty: { fr: string; en: string } | null;
  university: string | null;
};

export interface ReviewRecord {
  record: CaseRecord;
  reviewer: { id: string; fullName: string } | null;
  rejectedBy: { id: string; fullName: string } | null;
  person: Awaited<ReturnType<UsersService['reviewSummary']>>;
  references: Awaited<ReturnType<UsersService['describeReferences']>>;
  history: {
    id: string;
    status: VerificationStatus;
    submittedAt: Date | null;
    decidedAt: Date | null;
    rejectionReasonCode: string | null;
  }[];
}

export interface DocumentView {
  url: string;
  expiresAt: Date;
  contentType: string;
  watermark: string;
}

/**
 * Reviewer side of verification (Admin Web « Vérifications »): queue, claim, restricted viewer and
 * decisions. Every step is audited; appeals go to a different reviewer holding
 * `verification.appeal.decide`.
 */
@Injectable()
export class VerificationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly admins: AdminAccountsService,
  ) {}

  /** Oldest submissions first. */
  async queue(filter: QueueFilter): Promise<QueueRecord[]> {
    const rows = await this.prisma.verificationCase.findMany({
      where: {
        status: filter.status ?? { in: QUEUE_DEFAULT },
        ...(filter.type ? { type: filter.type } : {}),
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: QUEUE_PAGE,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: QUEUE_SELECT,
    });
    const people = await this.users.names(rows.map((row) => row.userId));
    const reviewers = await this.admins.names(
      rows.flatMap((row) => (row.reviewerId ? [row.reviewerId] : [])),
    );
    const declared = rows.map((row) => detailsOf(row));
    const affiliations = await this.users.affiliationNames({
      specialtyIds: declared.flatMap((details) =>
        typeof details.specialtyId === 'string' ? [details.specialtyId] : [],
      ),
      universityIds: declared.flatMap((details) =>
        typeof details.universityId === 'string' ? [details.universityId] : [],
      ),
    });
    return rows.map((row, index) => {
      const reviewerName = row.reviewerId ? reviewers.get(row.reviewerId) : undefined;
      const details = declared[index] ?? {};
      return {
        ...row,
        specialty:
          typeof details.specialtyId === 'string'
            ? (affiliations.specialties.get(details.specialtyId) ?? null)
            : null,
        university:
          typeof details.universityId === 'string'
            ? (affiliations.universities.get(details.universityId) ?? null)
            : null,
        reviewer:
          row.reviewerId && reviewerName ? { id: row.reviewerId, fullName: reviewerName } : null,
        user: { id: row.userId, ...(people.get(row.userId) ?? { firstName: '', lastName: '' }) },
      };
    });
  }

  async detail(caseId: string): Promise<ReviewRecord> {
    const record = await this.find(caseId);
    if (record.status === 'NOT_STARTED') throw new DomainError('NOT_FOUND', 'Case not found.');
    const details = detailsOf(record);
    const reviewer = record.reviewerId ? await this.adminName(record.reviewerId) : null;
    const rejectedBy = record.rejectedById ? await this.adminName(record.rejectedById) : null;
    const person = await this.users.reviewSummary(record.userId);
    const references = await this.users.describeReferences({
      specialtyId: typeof details.specialtyId === 'string' ? details.specialtyId : undefined,
      institutionId: typeof details.institutionId === 'string' ? details.institutionId : undefined,
      universityId: typeof details.universityId === 'string' ? details.universityId : undefined,
    });
    const history = await this.prisma.verificationCase.findMany({
      where: {
        userId: record.userId,
        type: record.type,
        id: { not: record.id },
        status: { not: 'NOT_STARTED' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        submittedAt: true,
        decidedAt: true,
        rejectionReasonCode: true,
      },
    });
    return { record, reviewer, rejectedBy, person, references, history };
  }

  async claim(admin: AdminPrincipal, caseId: string, client: ClientInfo): Promise<ReviewRecord> {
    const record = await this.find(caseId);
    if (record.status !== 'SUBMITTED' && record.status !== 'APPEALED') {
      throw new DomainError('INVALID_STATE', 'This case is not waiting for a reviewer.');
    }
    this.assertMayDecide(admin, record);
    const { count } = await this.prisma.verificationCase.updateMany({
      where: { id: caseId, status: record.status },
      data: { status: 'IN_REVIEW', reviewerId: admin.adminId },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'Another reviewer took this case.');
    await this.record(
      admin,
      client,
      'verification.claimed',
      caseId,
      { status: record.status },
      { status: 'IN_REVIEW' },
    );
    return this.detail(caseId);
  }

  /** Gives the case back to the queue. */
  async release(
    admin: AdminPrincipal,
    caseId: string,
    reason: string,
    client: ClientInfo,
  ): Promise<ReviewRecord> {
    const record = await this.claimedBy(admin, caseId);
    const back: VerificationStatus = record.appealedAt ? 'APPEALED' : 'SUBMITTED';
    const { count } = await this.prisma.verificationCase.updateMany({
      where: { id: caseId, status: 'IN_REVIEW', reviewerId: admin.adminId },
      data: { status: back, reviewerId: null },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'This case is no longer yours.');
    await this.record(
      admin,
      client,
      'verification.released',
      caseId,
      { status: 'IN_REVIEW' },
      { status: back },
      reason,
    );
    return this.detail(caseId);
  }

  async approve(
    admin: AdminPrincipal,
    caseId: string,
    input: { reason: string; expiresAt?: Date },
    client: ClientInfo,
  ): Promise<ReviewRecord> {
    const record = await this.claimedBy(admin, caseId);
    const now = new Date();
    if (input.expiresAt && input.expiresAt <= now) {
      throw new DomainError('VALIDATION_FAILED', 'The expiry must be in the future.', {
        fields: { expiresAt: ['Must be in the future.'] },
      });
    }
    const target = caseTarget(record);
    const check = checkDetails(record.type, target, detailsOf(record));
    if (!check.ok) throw new DomainError('INVALID_STATE', 'The declared details are incomplete.');

    await this.prisma.$transaction(async (tx) => {
      await this.decide(tx, admin, caseId, now, {
        status: 'VERIFIED',
        expiresAt: input.expiresAt ?? null,
        rejectionReasonCode: null,
        rejectionNote: null,
      });
    });
    const details = check.details;
    if ('professionalType' in details) {
      await this.users.applyVerifiedStatus(record.userId, {
        professionalType: details.professionalType,
        specialtyId: 'specialtyId' in details ? details.specialtyId : undefined,
        institutionId: 'institutionId' in details ? details.institutionId : undefined,
        universityId: 'universityId' in details ? details.universityId : undefined,
        academicYear: 'academicYear' in details ? details.academicYear : undefined,
        residencyYear: 'residencyYear' in details ? details.residencyYear : undefined,
        orderNumberMasked:
          'orderNumber' in details ? maskOrderNumber(details.orderNumber) : undefined,
      });
    }
    await this.notifications.notify({
      userId: record.userId,
      type: 'verification.decided',
      messageKey: 'mobile.notifications.verificationApproved',
      params: { caseId, caseType: record.type },
    });
    await this.record(
      admin,
      client,
      record.appealedAt ? 'verification.appeal_approved' : 'verification.approved',
      caseId,
      { status: 'IN_REVIEW' },
      { status: 'VERIFIED', expiresAt: input.expiresAt?.toISOString() ?? null },
      input.reason,
    );
    return this.detail(caseId);
  }

  async reject(
    admin: AdminPrincipal,
    caseId: string,
    input: { reason: string; reasonCode: RejectionReason; note?: string },
    client: ClientInfo,
  ): Promise<ReviewRecord> {
    const record = await this.claimedBy(admin, caseId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.decide(tx, admin, caseId, now, {
        status: 'REJECTED',
        expiresAt: null,
        rejectionReasonCode: input.reasonCode,
        rejectionNote: input.note ?? null,
      });
    });
    await this.notifications.notify({
      userId: record.userId,
      type: 'verification.decided',
      messageKey: 'mobile.notifications.verificationRejected',
      params: { caseId, caseType: record.type },
    });
    await this.record(
      admin,
      client,
      record.appealedAt ? 'verification.appeal_rejected' : 'verification.rejected',
      caseId,
      { status: 'IN_REVIEW' },
      { status: 'REJECTED', reasonCode: input.reasonCode },
      input.reason,
    );
    return this.detail(caseId);
  }

  /**
   * Restricted viewer (section 06): a 60-second signed URL for one document of a case the admin is
   * reviewing, with the watermark text the viewer overlays. Every view is audited.
   */
  async viewDocument(
    admin: AdminPrincipal,
    documentId: string,
    client: ClientInfo,
  ): Promise<DocumentView> {
    const document = await this.prisma.verificationDocument.findUnique({
      where: { id: documentId },
      select: { id: true, caseId: true, storageKey: true, mimeType: true, stepType: true },
    });
    if (!document) throw new DomainError('NOT_FOUND', 'Document not found.');
    await this.claimedBy(admin, document.caseId);
    const ttl = SIGNED_READ_TTL.verificationDocument;
    const now = new Date();
    const url = await this.storage.getSignedReadUrl('PRIVATE', document.storageKey, {
      ttlSeconds: ttl,
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: 'verification.document_viewed',
      entityType: 'VerificationDocument',
      entityId: document.id,
      after: { caseId: document.caseId, stepType: document.stepType },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return {
      url,
      expiresAt: new Date(now.getTime() + ttl * 1000),
      contentType: document.mimeType,
      watermark: `${admin.fullName} · ${admin.email} · ${now.toISOString()}`,
    };
  }

  // ───────────────────────────────── helpers ─────────────────────────────────

  private async find(caseId: string): Promise<CaseRecord> {
    const record = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
      select: CASE_SELECT,
    });
    if (!record) throw new DomainError('NOT_FOUND', 'Case not found.');
    return record;
  }

  private async claimedBy(admin: AdminPrincipal, caseId: string): Promise<CaseRecord> {
    const record = await this.find(caseId);
    if (record.status !== 'IN_REVIEW' || record.reviewerId !== admin.adminId) {
      throw new DomainError('INVALID_STATE', 'Claim this case before reviewing it.');
    }
    this.assertMayDecide(admin, record);
    return record;
  }

  /** An appeal needs `verification.appeal.decide` and a reviewer other than the one who rejected. */
  private assertMayDecide(admin: AdminPrincipal, record: CaseRecord): void {
    if (!record.appealedAt) return;
    if (!admin.grants.includes('verification.appeal.decide')) {
      throw new DomainError(
        'FORBIDDEN',
        'Deciding an appeal needs the verification.appeal.decide grant.',
      );
    }
    if (record.rejectedById === admin.adminId) {
      throw new DomainError('FORBIDDEN', 'An appeal is decided by a different reviewer.');
    }
  }

  private async decide(
    tx: Prisma.TransactionClient,
    admin: AdminPrincipal,
    caseId: string,
    now: Date,
    data: {
      status: 'VERIFIED' | 'REJECTED';
      expiresAt: Date | null;
      rejectionReasonCode: string | null;
      rejectionNote: string | null;
    },
  ): Promise<void> {
    const { count } = await tx.verificationCase.updateMany({
      where: { id: caseId, status: 'IN_REVIEW', reviewerId: admin.adminId },
      data: { ...data, decidedAt: now },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'This case is no longer yours.');
    await tx.verificationDocument.updateMany({
      where: { caseId },
      data: { purgeAfter: addMonths(now, DOCUMENT_RETENTION_MONTHS) },
    });
  }

  private async adminName(id: string): Promise<{ id: string; fullName: string } | null> {
    const fullName = (await this.admins.names([id])).get(id);
    return fullName ? { id, fullName } : null;
  }

  private record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    caseId: string,
    before: Prisma.InputJsonObject,
    after: Prisma.InputJsonObject,
    reason?: string,
  ): Promise<void> {
    return this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action,
      entityType: 'VerificationCase',
      entityId: caseId,
      before,
      after,
      reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
