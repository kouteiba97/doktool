import { Injectable } from '@nestjs/common';
import type { VerificationStatus, VerificationType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

/** The facts of one case the access policy looks at. */
export interface CaseSnapshot {
  status: VerificationStatus;
  submittedAt: Date | null;
  expiresAt: Date | null;
  /**
   * A newer case of the same type is being prepared or reviewed while this earlier decision still
   * counts (renewal, role change): see {@link VerificationStatusService.accessSnapshot}.
   */
  renewalPending?: boolean;
}

/** Latest case of each type; a type with no case is NOT_STARTED. */
export type VerificationSnapshot = Record<VerificationType, CaseSnapshot>;

const NOT_STARTED: CaseSnapshot = { status: 'NOT_STARTED', submittedAt: null, expiresAt: null };
/** Statuses of a case not decided yet. */
const UNDECIDED: ReadonlySet<VerificationStatus> = new Set([
  'NOT_STARTED',
  'SUBMITTED',
  'IN_REVIEW',
  'APPEALED',
]);
const TYPES: readonly VerificationType[] = ['IDENTITY', 'PROFESSIONAL_STATUS', 'STUDENT_STATUS'];

/** Read side of verification used by the access policy. */
@Injectable()
export class VerificationStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /** The latest case of each type (NOT_STARTED when none). */
  async snapshot(userId: string): Promise<VerificationSnapshot> {
    const cases = await this.prisma.verificationCase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['type'],
      select: { type: true, status: true, submittedAt: true, expiresAt: true },
    });
    const snapshot: VerificationSnapshot = {
      IDENTITY: NOT_STARTED,
      PROFESSIONAL_STATUS: NOT_STARTED,
      STUDENT_STATUS: NOT_STARTED,
    };
    for (const item of cases) {
      snapshot[item.type] = {
        status: item.status,
        submittedAt: item.submittedAt,
        expiresAt: item.expiresAt,
      };
    }
    return snapshot;
  }

  /**
   * What access and checkout rely on (section 27: re-verification never interrupts access). While
   * the latest case of a type is not decided yet, the decision before it keeps counting: a VERIFIED
   * case until its expiry and, for professional status, a lapsed (EXPIRED) one too, since with a
   * live subscription an expiry does not end access before the period end. Without such an earlier
   * decision, the open case itself is reported, as {@link snapshot} does.
   */
  async accessSnapshot(userId: string, now = new Date()): Promise<VerificationSnapshot> {
    const cases = await this.prisma.verificationCase.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { type: true, status: true, submittedAt: true, expiresAt: true },
    });
    const snapshot: VerificationSnapshot = {
      IDENTITY: NOT_STARTED,
      PROFESSIONAL_STATUS: NOT_STARTED,
      STUDENT_STATUS: NOT_STARTED,
    };
    for (const type of TYPES) {
      const ofType = cases.filter((item) => item.type === type);
      const latest = ofType[0];
      if (!latest) continue;
      snapshot[type] = {
        status: latest.status,
        submittedAt: latest.submittedAt,
        expiresAt: latest.expiresAt,
      };
      if (!UNDECIDED.has(latest.status)) continue;
      const previous = ofType.find((item) => !UNDECIDED.has(item.status));
      const stillVerified =
        previous?.status === 'VERIFIED' &&
        (previous.expiresAt === null || previous.expiresAt > now);
      const lapsed =
        type === 'PROFESSIONAL_STATUS' &&
        (previous?.status === 'EXPIRED' || previous?.status === 'VERIFIED');
      if (previous && (stillVerified || lapsed)) {
        snapshot[type] = {
          submittedAt: previous.submittedAt,
          expiresAt: previous.expiresAt,
          status: stillVerified ? 'VERIFIED' : 'EXPIRED',
          renewalPending: true,
        };
      }
    }
    return snapshot;
  }

  /** Cases waiting for a decision, the oldest ones, and how many wait longer than the SLA. */
  async waiting(now: Date, slaHours: number, limit: number) {
    const waiting = {
      status: { in: ['SUBMITTED', 'APPEALED', 'IN_REVIEW'] as VerificationStatus[] },
    };
    const breachBefore = new Date(now.getTime() - slaHours * 3_600_000);
    const [count, breaches, oldest] = await Promise.all([
      this.prisma.verificationCase.count({ where: waiting }),
      this.prisma.verificationCase.count({
        where: {
          ...waiting,
          OR: [
            { appealedAt: { lt: breachBefore } },
            { appealedAt: null, submittedAt: { lt: breachBefore } },
          ],
        },
      }),
      this.prisma.verificationCase.findMany({
        where: waiting,
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          submittedAt: true,
          appealedAt: true,
          userId: true,
        },
      }),
    ]);
    return { count, breaches, oldest };
  }

  /** Onboarding funnel (analytics « Utilisateurs »): people who submitted, and who got verified. */
  async funnel(
    from: Date,
    to: Date,
  ): Promise<{ submitted: number; verified: number; rejected: number }> {
    const distinctUsers = async (where: object) =>
      (
        await this.prisma.verificationCase.findMany({
          where: { type: { in: ['PROFESSIONAL_STATUS', 'STUDENT_STATUS'] }, ...where },
          distinct: ['userId'],
          select: { userId: true },
        })
      ).length;
    const [submitted, verified, rejected] = await Promise.all([
      distinctUsers({ submittedAt: { gte: from, lt: to } }),
      distinctUsers({ status: 'VERIFIED', decidedAt: { gte: from, lt: to } }),
      distinctUsers({ status: 'REJECTED', decidedAt: { gte: from, lt: to } }),
    ]);
    return { submitted, verified, rejected };
  }
}
