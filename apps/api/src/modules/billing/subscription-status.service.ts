import { Injectable } from '@nestjs/common';
import type { SubscriptionStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}

/** Read side of billing used by the access policy (subscriptions are written in Phase 14). */
@Injectable()
export class SubscriptionStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's most relevant subscription: a live one first, otherwise the most recent. */
  async current(userId: string): Promise<SubscriptionSnapshot | null> {
    const select = { status: true, currentPeriodEnd: true, graceEndsAt: true } as const;
    const live = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'GRACE', 'CANCELED'] } },
      orderBy: { currentPeriodEnd: 'desc' },
      select,
    });
    return (
      live ??
      (await this.prisma.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select,
      }))
    );
  }
}
