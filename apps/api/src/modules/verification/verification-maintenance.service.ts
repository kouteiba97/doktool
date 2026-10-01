import { Injectable } from '@nestjs/common';
import type { VerificationStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { NotificationsService } from '../notifications/index.js';
import { VerificationFilesService } from './verification-files.service.js';
import {
  ABANDONED_CASE_DAYS,
  addMonths,
  DOCUMENT_RETENTION_MONTHS,
  EXPIRY_REMINDER_DAYS,
} from './verification.policy.js';

const DAY_MS = 24 * 3600 * 1000;
const BATCH = 200;
/** Cases no reviewer has decided: nothing about them needs keeping once the account is gone. */
const UNDECIDED: ReadonlySet<VerificationStatus> = new Set([
  'NOT_STARTED',
  'SUBMITTED',
  'IN_REVIEW',
  'APPEALED',
]);

/** Daily verification housekeeping: expiry, reminders and the retention purge (section 06). */
@Injectable()
export class VerificationMaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: VerificationFilesService,
    private readonly notifications: NotificationsService,
  ) {}

  /** VERIFIED cases past their expiry become EXPIRED, and the person is told. */
  async expireCases(now = new Date()): Promise<number> {
    const due = await this.prisma.verificationCase.findMany({
      where: { status: 'VERIFIED', expiresAt: { lte: now } },
      select: { id: true, userId: true, type: true },
      take: BATCH,
    });
    for (const item of due) {
      const { count } = await this.prisma.verificationCase.updateMany({
        where: { id: item.id, status: 'VERIFIED' },
        data: { status: 'EXPIRED' },
      });
      if (count === 1) {
        await this.notifications.notify({
          userId: item.userId,
          type: 'verification.expired',
          messageKey: 'mobile.notifications.verificationExpired',
          params: { caseId: item.id, caseType: item.type },
        });
      }
    }
    return due.length;
  }

  /**
   * One reminder per threshold (60 and 14 days before expiry). A threshold already passed when the
   * case was approved is skipped in favour of the nearer one.
   */
  async sendExpiryReminders(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...EXPIRY_REMINDER_DAYS) * DAY_MS);
    const expiring = await this.prisma.verificationCase.findMany({
      where: { status: 'VERIFIED', expiresAt: { gt: now, lte: horizon } },
      select: { id: true, userId: true, type: true, expiresAt: true },
      take: BATCH,
    });
    let sent = 0;
    for (const item of expiring) {
      if (!item.expiresAt) continue;
      const days = Math.ceil((item.expiresAt.getTime() - now.getTime()) / DAY_MS);
      const threshold = [...EXPIRY_REMINDER_DAYS]
        .sort((a, b) => a - b)
        .find((limit) => days <= limit);
      if (threshold === undefined) continue;
      if (
        await this.notifications.exists(item.userId, 'verification.expiring', {
          caseId: item.id,
          reminder: threshold,
        })
      ) {
        continue;
      }
      await this.notifications.notify({
        userId: item.userId,
        type: 'verification.expiring',
        messageKey: 'mobile.notifications.verificationExpiring',
        params: { caseId: item.id, caseType: item.type, reminder: threshold, days },
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * Account deletion: every document of the person is deleted now, cases still waiting for a
   * decision leave the queue, and decided cases keep only the decision (who, when, outcome) with
   * their declared details cleared. Returns the number of documents deleted.
   */
  async eraseUser(userId: string): Promise<number> {
    const cases = await this.prisma.verificationCase.findMany({
      where: { userId },
      select: { id: true, status: true },
    });
    let documents = 0;
    for (const item of cases) {
      documents += await this.files.eraseCase(item.id);
      if (UNDECIDED.has(item.status)) {
        await this.prisma.verificationCase.deleteMany({ where: { id: item.id } });
      }
    }
    return documents;
  }

  /**
   * Deletes documents past retention, clears declared details of cases decided more than the
   * retention period ago, and deletes cases abandoned before submission.
   */
  async purge(now = new Date()): Promise<{ documents: number; abandoned: number }> {
    const due = await this.prisma.verificationDocument.findMany({
      where: { purgeAfter: { lte: now } },
      select: { id: true, storageKey: true },
      take: BATCH,
    });
    for (const document of due) await this.files.deleteDocument(document);

    await this.prisma.verificationCase.updateMany({
      where: {
        status: { in: ['VERIFIED', 'REJECTED', 'EXPIRED'] },
        decidedAt: { lte: addMonths(now, -DOCUMENT_RETENTION_MONTHS) },
        documents: { none: {} },
      },
      data: { declaredDetails: {} },
    });

    const abandoned = await this.prisma.verificationCase.findMany({
      where: {
        status: 'NOT_STARTED',
        updatedAt: { lt: new Date(now.getTime() - ABANDONED_CASE_DAYS * DAY_MS) },
      },
      select: { id: true },
      take: BATCH,
    });
    for (const item of abandoned) {
      await this.files.eraseCase(item.id);
      await this.prisma.verificationCase.deleteMany({
        where: { id: item.id, status: 'NOT_STARTED' },
      });
    }
    return { documents: due.length, abandoned: abandoned.length };
  }
}
