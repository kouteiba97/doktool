import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ActivityKind, FavoriteTargetType, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import type { ItemAccess } from '../access/index.js';
import { CalculatorsService } from '../calculators/index.js';
import { ReferenceDocumentsService } from '../reference-library/index.js';

/** Favorites a person can keep (section 13: favorites first everywhere). */
export const MAX_FAVORITES = 500;
/** Research history kept per person; older entries are dropped. */
export const MAX_ACTIVITY = 500;
const PAGE_SIZE = 50;

export interface FavoriteView {
  targetType: FavoriteTargetType;
  targetId: string;
  createdAt: Date;
  /** Null when the model or calculator is no longer published (« N'est plus disponible »). */
  item: {
    kind: 'ORDONNANCE' | 'CERTIFICATE' | 'CALCULATOR';
    slug: string | null;
    titleFr: string;
    titleEn: string | null;
    access: ItemAccess;
  } | null;
}

export interface ActivityInput {
  kind: ActivityKind;
  targetType?: FavoriteTargetType;
  targetId?: string;
  queryText?: string;
  occurredAt: Date;
}

export interface ActivityRecord {
  id: string;
  kind: ActivityKind;
  targetType: FavoriteTargetType | null;
  targetId: string | null;
  queryText: string | null;
  occurredAt: Date;
}

/**
 * Favorites and the person's own research history (Profile › Activité). The history is private:
 * admins only ever see counts (section 16). Calculator inputs are never recorded (Lock L42).
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceDocumentsService,
    private readonly calculators: CalculatorsService,
  ) {}

  // ───────────────────────────────── favorites ─────────────────────────────────

  async favorites(viewer: Viewer & { userId: string }): Promise<FavoriteView[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId: viewer.userId },
      orderBy: { createdAt: 'desc' },
    });
    const published = await this.publishedItems(viewer);
    return rows.map((row) => ({
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
      item: published.get(`${row.targetType}:${row.targetId}`) ?? null,
    }));
  }

  /** Idempotent. Only a currently published model or calculator can become a favorite. */
  async addFavorite(
    viewer: Viewer & { userId: string },
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void> {
    const published = await this.publishedItems(viewer);
    if (!published.has(`${targetType}:${targetId}`)) {
      throw new DomainError('NOT_FOUND', 'Nothing to add to favorites.');
    }
    const count = await this.prisma.favorite.count({ where: { userId: viewer.userId } });
    if (count >= MAX_FAVORITES) {
      throw new DomainError('INVALID_STATE', `At most ${MAX_FAVORITES} favorites.`);
    }
    await this.prisma.favorite.upsert({
      where: { userId_targetType_targetId: { userId: viewer.userId, targetType, targetId } },
      create: { userId: viewer.userId, targetType, targetId },
      update: {},
    });
  }

  async removeFavorite(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, targetType, targetId } });
  }

  // ───────────────────────────────── history ─────────────────────────────────

  /** Stores entries recorded on the device (synced in batches, possibly after being offline). */
  async record(userId: string, deviceId: string, entries: ActivityInput[]): Promise<void> {
    if (entries.length === 0) return;
    const now = Date.now();
    const data: Prisma.RecentActivityCreateManyInput[] = entries.map((entry) => {
      const occurredAt = entry.occurredAt.getTime() > now ? new Date(now) : entry.occurredAt;
      switch (entry.kind) {
        case 'SEARCH':
          if (!entry.queryText?.trim()) {
            throw new DomainError('VALIDATION_FAILED', 'A search entry needs its query.', {
              fields: { queryText: ['Required for SEARCH.'] },
            });
          }
          return {
            userId,
            deviceId,
            kind: 'SEARCH',
            queryText: entry.queryText.trim().slice(0, 200),
            occurredAt,
          };
        case 'REFERENCE_VIEW':
        case 'CALCULATOR_USE': {
          const targetType = entry.kind === 'REFERENCE_VIEW' ? 'REFERENCE_DOCUMENT' : 'CALCULATOR';
          if (!entry.targetId || (entry.targetType && entry.targetType !== targetType)) {
            throw new DomainError('VALIDATION_FAILED', 'This entry needs its target.', {
              fields: { targetId: [`Required, of type ${targetType}.`] },
            });
          }
          return {
            userId,
            deviceId,
            kind: entry.kind,
            targetType,
            targetId: entry.targetId,
            occurredAt,
          };
        }
      }
    });
    await this.prisma.recentActivity.createMany({ data });
    await this.trim(userId);
  }

  async history(
    userId: string,
    filter: { kind?: ActivityKind; before?: Date },
  ): Promise<ActivityRecord[]> {
    return this.prisma.recentActivity.findMany({
      where: {
        userId,
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.before ? { occurredAt: { lt: filter.before } } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        targetType: true,
        targetId: true,
        queryText: true,
        occurredAt: true,
      },
    });
  }

  async clearHistory(userId: string, kind?: ActivityKind): Promise<void> {
    await this.prisma.recentActivity.deleteMany({ where: { userId, ...(kind ? { kind } : {}) } });
  }

  private async trim(userId: string): Promise<void> {
    const cutoff = await this.prisma.recentActivity.findMany({
      where: { userId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: MAX_ACTIVITY,
      take: 1,
      select: { occurredAt: true },
    });
    if (cutoff[0]) {
      await this.prisma.recentActivity.deleteMany({
        where: { userId, occurredAt: { lte: cutoff[0].occurredAt } },
      });
    }
  }

  /** Every published model and calculator with the viewer's access, keyed `TYPE:id`. */
  private async publishedItems(
    viewer: Viewer,
  ): Promise<Map<string, NonNullable<FavoriteView['item']>>> {
    const items = new Map<string, NonNullable<FavoriteView['item']>>();
    for (const type of ['ORDONNANCE', 'CERTIFICATE'] as const) {
      for (const item of await this.references.list(viewer, type)) {
        items.set(`REFERENCE_DOCUMENT:${item.id}`, {
          kind: type,
          slug: null,
          titleFr: item.titleFr,
          titleEn: item.titleEn,
          access: item.access,
        });
      }
    }
    for (const calculator of await this.calculators.list(viewer)) {
      items.set(`CALCULATOR:${calculator.id}`, {
        kind: 'CALCULATOR',
        slug: calculator.slug,
        titleFr: calculator.nameFr,
        titleEn: calculator.nameEn,
        access: calculator.access,
      });
    }
    return items;
  }
}
