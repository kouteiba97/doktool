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
}
