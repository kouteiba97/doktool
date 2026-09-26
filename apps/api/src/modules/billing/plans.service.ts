import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { ProfessionalType, SubscriptionPlan } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';

export interface PlanInput {
  code: string;
  nameFr: string;
  nameEn: string;
  audience: ProfessionalType[];
  priceMinor: number;
  durationDays: number;
  includesFr: string[];
  includesEn: string[];
  excludesFr: string[];
  excludesEn: string[];
  isPurchasable: boolean;
  reason: string;
}

/**
 * The plan catalogue (ADR-006 D4: Pro Monthly and Pro Annual, prices set by the Super Admin). A plan
 * is never edited: a new price or inclusion list is a new version of the same code, and the older
 * versions stop being sold. Subscriptions and transactions keep the version they bought.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The purchasable plans for a professional type, one (latest) version per code. */
  async purchasable(professionalType: ProfessionalType): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      where: { isPurchasable: true, audience: { has: professionalType } },
      orderBy: [{ durationDays: 'asc' }, { code: 'asc' }],
    });
  }

  all(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });
  }

  async byId(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new DomainError('NOT_FOUND', 'Plan not found.');
    return plan;
  }

  /** Publishes a plan code or a new version of it; earlier versions of the code stop being sold. */
  async publish(
    admin: AdminPrincipal,
    input: PlanInput,
    client: ClientInfo,
  ): Promise<SubscriptionPlan> {
    if (input.audience.includes('STUDENT')) {
      throw new DomainError('VALIDATION_FAILED', 'Students never subscribe (ADR-006 Q2).', {
        fields: { audience: ['Doctors and/or residents only.'] },
      });
    }
    const plan = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.subscriptionPlan.findFirst({
        where: { code: input.code },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      if (input.isPurchasable) {
        await tx.subscriptionPlan.updateMany({
          where: { code: input.code },
          data: { isPurchasable: false },
        });
      }
      return tx.subscriptionPlan.create({
        data: {
          code: input.code,
          version: (latest?.version ?? 0) + 1,
          nameFr: input.nameFr,
          nameEn: input.nameEn,
          audience: input.audience,
          priceMinor: input.priceMinor,
          currency: 'DZD',
          durationDays: input.durationDays,
          includesFr: input.includesFr,
          includesEn: input.includesEn,
          excludesFr: input.excludesFr,
          excludesEn: input.excludesEn,
          isPurchasable: input.isPurchasable,
        },
      });
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: 'plan.version_published',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      after: {
        code: plan.code,
        version: plan.version,
        priceMinor: plan.priceMinor,
        durationDays: plan.durationDays,
        isPurchasable: plan.isPurchasable,
      },
      reason: input.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return plan;
  }

  /** Starts or stops selling one version (only one version of a code is sold at a time). */
  async setPurchasable(
    admin: AdminPrincipal,
    planId: string,
    input: { isPurchasable: boolean; reason: string },
    client: ClientInfo,
  ): Promise<SubscriptionPlan> {
    const plan = await this.byId(planId);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isPurchasable) {
        await tx.subscriptionPlan.updateMany({
          where: { code: plan.code },
          data: { isPurchasable: false },
        });
      }
      return tx.subscriptionPlan.update({
        where: { id: planId },
        data: { isPurchasable: input.isPurchasable },
      });
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: input.isPurchasable ? 'plan.sale_started' : 'plan.sale_stopped',
      entityType: 'SubscriptionPlan',
      entityId: planId,
      before: { isPurchasable: plan.isPurchasable },
      after: { isPurchasable: updated.isPurchasable },
      reason: input.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return updated;
  }
}
