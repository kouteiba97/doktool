import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ActivityKind, FavoriteTargetType, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import {
  type AccessProfile,
  AccessService,
  type FeatureKey,
  type ItemAccess,
} from '../access/index.js';
import { CalculatorsService } from '../calculators/index.js';
import { PregnancyService } from '../pregnancy/index.js';
import { ReferenceDocumentsService } from '../reference-library/index.js';

/** What each kind of history entry points at. */
const TARGETS = {
  REFERENCE_VIEW: 'REFERENCE_DOCUMENT',
  CALCULATOR_USE: 'CALCULATOR',
  PREGNANCY_VIEW: 'SUBSTANCE',
} as const satisfies Record<Exclude<ActivityKind, 'SEARCH'>, FavoriteTargetType>;

/** Favorites a person can keep (section 13: favorites first everywhere). */
export const MAX_FAVORITES = 500;
/** Research history kept per person; older entries are dropped. */
export const MAX_ACTIVITY = 500;
const PAGE_SIZE = 50;

/** A favorite as the app shows it. */
export interface FavoriteView {
  targetType: FavoriteTargetType;
  targetId: string;
  createdAt: Date;
  /** Null when the model or calculator is no longer published (« N'est plus disponible »). */
  item: {
    kind: 'ORDONNANCE' | 'CERTIFICATE' | 'CALCULATOR' | 'SUBSTANCE';
    slug: string | null;
    titleFr: string;
    titleEn: string | null;
    access: ItemAccess;
  } | null;
}

/** One history entry as the device sends it. */
export interface ActivityInput {
  kind: ActivityKind;
  targetType?: FavoriteTargetType;
  targetId?: string;
  queryText?: string;
  occurredAt: Date;
}

/** One stored history entry. */
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
    private readonly pregnancy: PregnancyService,
    private readonly access: AccessService,
  ) {}

  /** Account deletion: the person's favorites and research history go with the account. */
  async eraseUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.favorite.deleteMany({ where: { userId } }),
      this.prisma.recentActivity.deleteMany({ where: { userId } }),
    ]);
  }

  // ───────────────────────────────── favorites ─────────────────────────────────

  /** Admin Web « Activité »: how many favorites and history entries, by kind — never which. */
  async countsFor(userId: string) {
    const [favorites, history] = await Promise.all([
      this.prisma.favorite.groupBy({
        by: ['targetType'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.recentActivity.groupBy({
        by: ['kind'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);
    return {
      favorites: favorites.map((row) => ({ targetType: row.targetType, count: row._count._all })),
      history: history.map((row) => ({ kind: row.kind, count: row._count._all })),
    };
  }

  /**
   * The person's favorites with the title and access of each item; items no longer published come
   * back with `item: null`.
   */
  async favorites(viewer: Viewer & { userId: string }): Promise<FavoriteView[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId: viewer.userId },
      orderBy: { createdAt: 'desc' },
    });
    const published = await this.itemsFor(viewer, rows);
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
    const profile = await this.access.profileFor(viewer);
    if (!writable(profile, 'favorites')) {
      // Read-only (RESTRICTED): the lock is the one that restricts the account.
      throw new DomainError('FEATURE_LOCKED', 'Favorites are read-only for this account.', {
        lockReason: profile.content.calculators.lockReason,
        unlockPath: profile.content.calculators.unlockPath,
      });
    }
    const published = await this.itemsFor(viewer, [{ targetType, targetId }]);
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

  /** Removes one favorite; nothing happens if it was not there. */
  async removeFavorite(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, targetType, targetId } });
  }

  // ───────────────────────────────── history ─────────────────────────────────

  /** Stores entries recorded on the device (synced in batches, possibly after being offline). */
  async record(
    viewer: Viewer & { userId: string },
    deviceId: string,
    entries: ActivityInput[],
  ): Promise<void> {
    if (entries.length === 0) return;
    // A restricted account's history is read-only: the device's entries are accepted (so its
    // upload queue empties) but not kept.
    if (!writable(await this.access.profileFor(viewer), 'activity.history')) return;
    const { userId } = viewer;
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
        case 'CALCULATOR_USE':
        case 'PREGNANCY_VIEW': {
          const targetType = TARGETS[entry.kind];
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

  /**
   * One page of the person's history, newest first; `before` continues from the last entry shown.
   */
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

  /** Deletes the whole history, or only one kind of entry. */
  async clearHistory(userId: string, kind?: ActivityKind): Promise<void> {
    await this.prisma.recentActivity.deleteMany({ where: { userId, ...(kind ? { kind } : {}) } });
  }

  /** Keeps only the newest MAX_ACTIVITY entries of a person. */
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

  /**
   * The items behind some favorites, still published, with the viewer's access, keyed `TYPE:id`.
   * Only those ids are read; a substance merged into another answers with the one kept.
   */
  private async itemsFor(
    viewer: Viewer,
    targets: readonly { targetType: FavoriteTargetType; targetId: string }[],
  ): Promise<Map<string, NonNullable<FavoriteView['item']>>> {
    const idsOf = (type: FavoriteTargetType) =>
      targets.filter((target) => target.targetType === type).map((target) => target.targetId);
    const [references, calculators, substances] = await Promise.all([
      this.references.byIds(viewer, idsOf('REFERENCE_DOCUMENT')),
      this.calculators.summariesByIds(viewer, idsOf('CALCULATOR')),
      this.pregnancy.itemsByIds(viewer, idsOf('SUBSTANCE')),
    ]);
    const items = new Map<string, NonNullable<FavoriteView['item']>>();
    for (const item of references) {
      items.set(`REFERENCE_DOCUMENT:${item.id}`, {
        kind: item.type,
        slug: null,
        titleFr: item.titleFr,
        titleEn: item.titleEn,
        access: item.access,
      });
    }
    for (const calculator of calculators) {
      items.set(`CALCULATOR:${calculator.id}`, {
        kind: 'CALCULATOR',
        slug: calculator.slug,
        titleFr: calculator.nameFr,
        titleEn: calculator.nameEn,
        access: calculator.access,
      });
    }
    for (const [id, substance] of substances) {
      items.set(`SUBSTANCE:${id}`, {
        kind: 'SUBSTANCE',
        slug: null,
        titleFr: substance.nameFr,
        titleEn: substance.nameEn,
        access: substance.access,
      });
    }
    return items;
  }
}

/** True when the feature is available and not read-only for this account. */
function writable(profile: AccessProfile, key: FeatureKey): boolean {
  const feature = profile.features.find((candidate) => candidate.key === key);
  return feature?.state === 'AVAILABLE' && !feature.readOnly;
}
