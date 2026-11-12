import { Injectable } from '@nestjs/common';
import { everyPage } from '../../infrastructure/database/every-page.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { NotificationsService } from '../notifications/index.js';
import {
  addDays,
  DAY_MS,
  GRACE_DAYS,
  RECONCILE_AFTER_MINUTES,
  RENEWAL_REMINDER_DAYS,
} from './billing.policy.js';
import { CheckoutService } from './checkout.service.js';

const BATCH = 200;

/**
 * Manual renewal in V1 (section 06): reminders at 14 and 3 days, 7 days of grace with access kept,
 * then « Terminé ». Calm by design: notifications, never banners, countdowns or red (Lock L39).
 */
@Injectable()
export class SubscriptionLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Moves ended periods to grace, ended grace to expired, stopped renewals to expired. */
  async advance(now = new Date()): Promise<void> {
    await everyPage(
      (after) =>
        this.prisma.subscription.findMany({
          where: { status: 'ACTIVE', currentPeriodEnd: { lte: now }, ...after },
          select: { id: true, userId: true, currentPeriodEnd: true },
          orderBy: { id: 'asc' },
          take: BATCH,
        }),
      async (subscription) => {
        const graceEndsAt = addDays(subscription.currentPeriodEnd!, GRACE_DAYS);
        const { count } = await this.prisma.subscription.updateMany({
          where: { id: subscription.id, status: 'ACTIVE' },
          data: { status: 'GRACE', graceEndsAt },
        });
        if (count === 1) {
          await this.notifications.notify({
            userId: subscription.userId,
            type: 'subscription.grace',
            messageKey: 'mobile.notifications.subscriptionGrace',
            params: { subscriptionId: subscription.id, graceEndsAt: graceEndsAt.toISOString() },
          });
        }
      },
    );

    await everyPage(
      (after) =>
        this.prisma.subscription.findMany({
          where: {
            OR: [
              { status: 'GRACE', graceEndsAt: { lte: now } },
              { status: 'CANCELED', currentPeriodEnd: { lte: now } },
            ],
            ...after,
          },
          select: { id: true, userId: true, status: true },
          orderBy: { id: 'asc' },
          take: BATCH,
        }),
      async (subscription) => {
        const { count } = await this.prisma.subscription.updateMany({
          where: { id: subscription.id, status: subscription.status },
          data: { status: 'EXPIRED' },
        });
        if (count === 1) {
          await this.notifications.notify({
            userId: subscription.userId,
            type: 'subscription.ended',
            messageKey: 'mobile.notifications.subscriptionEnded',
            params: { subscriptionId: subscription.id },
          });
        }
      },
    );
  }

  /** One reminder per threshold before the end of an active period. */
  async remind(now = new Date()): Promise<void> {
    const horizon = new Date(now.getTime() + Math.max(...RENEWAL_REMINDER_DAYS) * DAY_MS);
    const thresholds = [...RENEWAL_REMINDER_DAYS].sort((a, b) => a - b);
    await everyPage(
      (after) =>
        this.prisma.subscription.findMany({
          where: { status: 'ACTIVE', currentPeriodEnd: { gt: now, lte: horizon }, ...after },
          select: { id: true, userId: true, currentPeriodEnd: true },
          orderBy: { id: 'asc' },
          take: BATCH,
        }),
      async (subscription) => {
        const days = Math.ceil((subscription.currentPeriodEnd!.getTime() - now.getTime()) / DAY_MS);
        const threshold = thresholds.find((limit) => days <= limit);
        if (threshold === undefined) return;
        const params = { subscriptionId: subscription.id, reminder: threshold };
        if (await this.notifications.exists(subscription.userId, 'subscription.renewal', params))
          return;
        await this.notifications.notify({
          userId: subscription.userId,
          type: 'subscription.renewal',
          messageKey: 'mobile.notifications.subscriptionRenewal',
          params: { ...params, endsAt: subscription.currentPeriodEnd!.toISOString() },
        });
      },
    );
  }

  /** Confirms checkouts nobody came back from, and cancels the abandoned ones. */
  async reconcile(now = new Date()): Promise<void> {
    const before = new Date(now.getTime() - RECONCILE_AFTER_MINUTES * 60_000);
    await everyPage(
      (after) =>
        this.prisma.transaction.findMany({
          where: { status: 'PENDING', createdAt: { lt: before }, ...after },
          orderBy: { id: 'asc' },
          take: BATCH,
        }),
      async (transaction) => {
        await this.checkout.settle(transaction, now);
      },
    );
  }
}
