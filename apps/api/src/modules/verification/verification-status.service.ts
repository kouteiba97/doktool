import { Injectable } from '@nestjs/common';
import type { VerificationStatus, VerificationType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export interface CaseSnapshot {
  status: VerificationStatus;
  submittedAt: Date | null;
  expiresAt: Date | null;
}

/** Latest case of each type; a type with no case is NOT_STARTED. */
export type VerificationSnapshot = Record<VerificationType, CaseSnapshot>;

const NOT_STARTED: CaseSnapshot = { status: 'NOT_STARTED', submittedAt: null, expiresAt: null };

/** Read side of verification used by the access policy. */
@Injectable()
export class VerificationStatusService {
  constructor(private readonly prisma: PrismaService) {}

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
