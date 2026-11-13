import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { ClinicalContentKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AdminPrincipal, Grant } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';

export type SignOffs = 1 | 2;

export const CLINICAL_CONTENT: readonly ClinicalContentKind[] = ['CALCULATOR', 'PREGNANCY_PROFILE'];

/** The grants that let an admin approve each kind of content. */
const REVIEW_GRANTS: Record<ClinicalContentKind, readonly Grant[]> = {
  CALCULATOR: ['calculators.review', 'calculators.publish'],
  PREGNANCY_PROFILE: ['pregnancy.review'],
};

/** The sign-off rule of one kind of clinical content, as Admin Web shows it. */
export interface ReviewPolicy {
  content: ClinicalContentKind;
  requiredSignOffs: SignOffs;
  /** Active admins who may approve this content (the author of a version never counts for it). */
  eligibleReviewers: number;
  updatedBy: { id: string; fullName: string } | null;
  updatedAt: Date | null;
}

/** What an approval does: record the first of two sign-offs, or publish. */
export interface Approval {
  publish: boolean;
  requiredSignOffs: SignOffs;
}

/**
 * Double sign-off for clinical content (ADR-024). One sign-off — the reviewer who publishes — is
 * the rule of ADR-006 D1; the Super Admin may require two for calculators, pregnancy profiles or
 * both. The second reviewer is never the author nor the first reviewer.
 *
 * Owns: `clinical_review_policies`.
 */
@Injectable()
export class ClinicalReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The number of sign-offs this kind of content needs now (1 unless set to 2). */
  async required(content: ClinicalContentKind): Promise<SignOffs> {
    const row = await this.prisma.clinicalReviewPolicy.findUnique({ where: { content } });
    return row?.requiredSignOffs === 2 ? 2 : 1;
  }

  /** Both policies with how many admins could approve. */
  async policies(): Promise<ReviewPolicy[]> {
    const rows = await this.prisma.clinicalReviewPolicy.findMany({
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
    return Promise.all(
      CLINICAL_CONTENT.map(async (content) => {
        const row = rows.find((candidate) => candidate.content === content);
        return {
          content,
          requiredSignOffs: row?.requiredSignOffs === 2 ? 2 : 1,
          eligibleReviewers: await this.eligibleReviewers(content),
          updatedBy: row?.updatedBy ?? null,
          updatedAt: row?.updatedAt ?? null,
        } satisfies ReviewPolicy;
      }),
    );
  }

  /**
   * Two sign-offs need two people who may approve; with fewer, nothing could ever be published,
   * so the change is refused.
   */
  async setPolicy(
    admin: AdminPrincipal,
    content: ClinicalContentKind,
    requiredSignOffs: SignOffs,
    reason: string,
    client: ClientInfo,
  ): Promise<ReviewPolicy> {
    const before = await this.required(content);
    if (requiredSignOffs === 2 && (await this.eligibleReviewers(content)) < 2) {
      throw new DomainError(
        'INVALID_STATE',
        'Two sign-offs need at least two active admins who may approve this content.',
        { fields: { requiredSignOffs: ['TOO_FEW_REVIEWERS'] } },
      );
    }
    await this.prisma.clinicalReviewPolicy.upsert({
      where: { content },
      create: { content, requiredSignOffs, updatedById: admin.adminId },
      update: { requiredSignOffs, updatedById: admin.adminId },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: 'clinical_review.policy.updated',
      entityType: 'ClinicalReviewPolicy',
      entityId: content,
      before: { requiredSignOffs: before },
      after: { requiredSignOffs },
      reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    const policy = (await this.policies()).find((row) => row.content === content);
    if (!policy) throw new Error(`No policy for ${content}`);
    return policy;
  }

  /**
   * Sign-offs an open version needs: the stricter of the rule when it was submitted and the rule
   * now, and always two once a first sign-off is recorded. Lowering the policy never relaxes a
   * version already in review.
   */
  async requiredFor(
    content: ClinicalContentKind,
    version: { requiredSignOffs: number; firstSignOffById: string | null },
  ): Promise<SignOffs> {
    if (version.firstSignOffById || version.requiredSignOffs === 2) return 2;
    return this.required(content);
  }

  /** Decides what an independent reviewer's approval does: a first sign-off, or publication. */
  async approval(
    content: ClinicalContentKind,
    version: { requiredSignOffs: number; firstSignOffById: string | null },
    admin: AdminPrincipal,
  ): Promise<Approval> {
    if (version.firstSignOffById === admin.adminId) {
      throw new DomainError(
        'FORBIDDEN',
        'The second sign-off must come from another reviewer than the first.',
      );
    }
    const requiredSignOffs = await this.requiredFor(content, version);
    return {
      publish: requiredSignOffs === 1 || version.firstSignOffById !== null,
      requiredSignOffs,
    };
  }

  /** Active admins holding every grant needed to approve this content. */
  private eligibleReviewers(content: ClinicalContentKind): Promise<number> {
    const now = new Date();
    return this.prisma.adminAccount.count({
      where: {
        status: 'ACTIVE',
        AND: REVIEW_GRANTS[content].map((grant) => ({
          grants: { some: { grant, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
        })),
      },
    });
  }
}
