import { Injectable } from '@nestjs/common';
import type { SubscriptionStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

/** The subscription facts the access policy looks at. */
export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}

/** Read side of billing used by the access policy. */
@Injectable()
export class SubscriptionStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Account deletion: a live subscription ends now, without refund (ADR-005). Its payments stay in
   * the ledger; a checkout still waiting for the provider is left to the payment flow.
   */
  async endForDeletedAccount(userId: string): Promise<number> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { userId, status: { in: ['ACTIVE', 'GRACE', 'CANCELED'] } },
      data: { status: 'EXPIRED', graceEndsAt: null },
    });
    return count;
  }

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
