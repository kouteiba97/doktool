import { Injectable } from '@nestjs/common';
import fr from '@doktool/i18n/messages.fr.json' with { type: 'json' };
import { DomainError } from '../../common/errors/domain-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

/** Parameters are identifiers, dates and numbers only — never free text typed by a person. */
export type NotificationParams = Record<string, string | number>;

export interface NewNotification {
  userId: string;
  /** Stable machine type, e.g. `verification.decided`. */
  type: string;
  /** A `mobile.notifications.*` catalogue key the app renders with `params`. */
  messageKey: string;
  params?: NotificationParams;
}

export interface NotificationRecord {
  id: string;
  type: string;
  messageKey: string;
  params: NotificationParams;
  readAt: Date | null;
  createdAt: Date;
}

const CATALOGUE = fr as Record<string, string>;
const PAGE_SIZE = 50;
/** Notifications are kept this long, read or not. */
export const NOTIFICATION_RETENTION_DAYS = 180;

const SELECT = {
  id: true,
  type: true,
  messageKey: true,
  params: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

/** In-app notifications, rendered by the clients from catalogue keys (section 19). */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Account deletion: the person's notifications go with the account. */
  async eraseUser(userId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { userId } });
  }

  async notify(input: NewNotification): Promise<void> {
    if (!input.messageKey.startsWith('mobile.notifications.') || !(input.messageKey in CATALOGUE)) {
      throw new Error(`Unknown notification message key "${input.messageKey}"`);
    }
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        messageKey: input.messageKey,
        params: input.params ?? {},
      },
    });
  }

  /** True when a notification of this type has all of `match` among its parameters (idempotent reminders). */
  async exists(userId: string, type: string, match: NotificationParams): Promise<boolean> {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        type,
        AND: Object.entries(match).map(([key, value]) => ({
          params: { path: [key], equals: value },
        })),
      },
    });
    return count > 0;
  }

  async list(userId: string, before?: Date): Promise<NotificationRecord[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE,
      select: SELECT,
    });
    return rows.map((row) => ({ ...row, params: row.params as NotificationParams }));
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (count === 0) throw new DomainError('NOT_FOUND', 'Notification not found.');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Deletes notifications past retention (daily job). */
  async purgeOld(): Promise<number> {
    const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 3600 * 1000);
    const { count } = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }
}
