import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { compareFrench, matchesAllWords } from '../../common/text/search-text.js';
import type {
  ClinicalSourceType,
  ContentReportReason,
  ProfileSection,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { AccessService, type ItemAccess } from '../access/index.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  alternativeIds,
  type Conduct,
  type ProfileContent,
  profileContentSchema,
} from './pregnancy.content.js';
import { likeWords } from './pregnancy.search.js';

export const SUMMARY_TARGETS = ['T1', 'T2', 'T3', 'PERIPARTUM', 'LACTATION'] as const;
export type SummaryTarget = (typeof SUMMARY_TARGETS)[number];

/** What a search result shows for one period of a published profile. */
export interface PeriodSummary {
  conduct: Conduct | null;
  evidenceLevel: number | null;
}

/** A search result with a per-period summary. */
export interface SubstanceHit extends SubstanceItem {
  /** Per period of the published profile; null while locked (no content for a locked item). */
  periods: Record<SummaryTarget, PeriodSummary | null> | null;
}

/** The conduct and evidence level of each period, for search results. */
function summaries(content: ProfileContent): Record<SummaryTarget, PeriodSummary | null> {
  const of = (
    period: { conduct: Conduct | null; evidence: { level: number | null } } | null | undefined,
  ) => (period ? { conduct: period.conduct, evidenceLevel: period.evidence.level } : null);
  return {
    T1: of(content.pregnancy?.periods.T1),
    T2: of(content.pregnancy?.periods.T2),
    T3: of(content.pregnancy?.periods.T3),
    PERIPARTUM: of(content.pregnancy?.periods.PERIPARTUM),
    LACTATION: of(content.lactation),
  };
}

/** A substance as the app lists it: published profiles only, each with the server's decision. */
export interface SubstanceItem {
  id: string;
  nameFr: string;
  nameEn: string | null;
  synonyms: string[];
  version: number;
  publishedAt: Date;
  access: ItemAccess;
}

/** A source as the app shows it. */
export interface SourceView {
  id: string;
  title: string;
  publisher: string | null;
  type: ClinicalSourceType;
  edition: string | null;
  year: number | null;
  url: string | null;
}

/** An opened profile: the content only when AVAILABLE, never for a locked item. */
export interface SubstanceProfile extends SubstanceItem {
  content: ProfileContent | null;
  alternatives: { id: string; nameFr: string; nameEn: string | null }[];
  sources: SourceView[];
  reviewedAt: Date;
  reviewerName: string;
  /** A newer version is in review: the published one remains the reference (info Alert). */
  underReview: boolean;
}

const PUBLISHED = {
  where: { status: 'PUBLISHED' },
  select: {
    id: true,
    version: true,
    publishedAt: true,
    reviewedAt: true,
    content: true,
    reviewedBy: { select: { fullName: true } },
    sources: { select: { source: true } },
  },
} as const;

/**
 * « Grossesse · Allaitement » for the app (ADR-019): enabled substances with a published profile.
 * Locked substances stay listed with their reason; only an AVAILABLE one yields its content.
 */
@Injectable()
export class PregnancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** A–Z list, optionally filtered by name or synonym (accent- and case-insensitive). */
  async list(viewer: Viewer, query?: string): Promise<SubstanceItem[]> {
    const rows = await this.published();
    const matching = query
      ? rows.filter((row) => matchesAllWords(query, [row.nameFr, row.nameEn, ...row.synonyms]))
      : rows;
    const items = await this.withAccess(viewer, matching);
    return items.sort((a, b) => compareFrench(a.nameFr, b.nameFr));
  }

  /**
   * One profile (a merged duplicate opens the substance kept); the content only when the viewer
   * may open it.
   */
  async get(viewer: Viewer, id: string): Promise<SubstanceProfile> {
    const row = await this.prisma.substance.findUnique({
      where: { id },
      include: {
        versions: PUBLISHED,
        _count: { select: { versions: { where: { status: 'IN_REVIEW' } } } },
      },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Substance not found.');
    // A duplicate merged into another substance opens that one (favorites, links, history keep
    // working). Merges never chain (ADR-027), so this is one step.
    if (row.mergedIntoId) return this.get(viewer, row.mergedIntoId);
    const published = row.versions[0];
    if (!row.enabled || !published) {
      throw new DomainError('CONTENT_UNAVAILABLE', 'This profile is no longer available.', {
        lockReason: 'NO_LONGER_AVAILABLE',
        unlockPath: null,
      });
    }
    const [item] = await this.withAccess(viewer, [{ ...row, published }]);
    const open = item!.access.state === 'AVAILABLE';
    const content = open ? profileContentSchema.parse(published.content) : null;
    const alternatives = content
      ? (await this.nameIndex(alternativeIds(content)))(alternativeIds(content), row.id)
      : [];
    return {
      ...item!,
      content,
      alternatives,
      sources: open ? published.sources.map(({ source }) => sourceView(source)) : [],
      reviewedAt: published.reviewedAt!,
      reviewerName: published.reviewedBy!.fullName,
      underReview: row._count.versions > 0,
    };
  }

  /**
   * The profiles this viewer may open, in full, for the offline store (Lock L44). Built in bulk —
   * one read of the published profiles, one access decision, one lookup of the alternatives'
   * names — so the cost does not grow with a query per substance.
   */
  async openable(viewer: Viewer): Promise<SubstanceProfile[]> {
    const rows = await this.published();
    const items = await this.withAccess(viewer, rows);
    const open = rows.flatMap((row, index) =>
      items[index]!.access.state === 'AVAILABLE'
        ? [{ row, item: items[index]!, content: profileContentSchema.parse(row.published.content) }]
        : [],
    );
    const [names, inReview] = await Promise.all([
      this.nameIndex(open.flatMap(({ content }) => alternativeIds(content))),
      this.prisma.substanceProfileVersion.groupBy({
        by: ['substanceId'],
        where: { status: 'IN_REVIEW', substanceId: { in: open.map(({ row }) => row.id) } },
        _count: { _all: true },
      }),
    ]);
    const reviewing = new Set(inReview.map((entry) => entry.substanceId));
    return open
      .map(({ row, item, content }) => ({
        ...item,
        content,
        alternatives: names(alternativeIds(content), row.id),
        sources: row.published.sources.map(({ source }) => sourceView(source)),
        reviewedAt: row.published.reviewedAt!,
        reviewerName: row.published.reviewedBy!.fullName,
        underReview: reviewing.has(row.id),
      }))
      .sort((a, b) => compareFrench(a.nameFr, b.nameFr));
  }

  /**
   * The listed substances among `ids` (favorites), keyed by the id asked for. A duplicate merged
   * into another substance is answered with the substance kept (ADR-027), so its favorite keeps
   * working; disabled or unpublished ones are left out.
   */
  async itemsByIds(viewer: Viewer, ids: readonly string[]): Promise<Map<string, SubstanceItem>> {
    if (ids.length === 0) return new Map();
    const asked = await this.prisma.substance.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, mergedIntoId: true },
    });
    const resolved = new Map(asked.map((row) => [row.id, row.mergedIntoId ?? row.id]));
    const rows = await this.prisma.substance.findMany({
      where: {
        id: { in: [...new Set(resolved.values())] },
        enabled: true,
        versions: { some: { status: 'PUBLISHED' } },
      },
      select: {
        id: true,
        nameFr: true,
        nameEn: true,
        synonyms: true,
        demoSample: true,
        versions: { where: { status: 'PUBLISHED' }, select: { version: true, publishedAt: true } },
      },
    });
    const items = await this.withAccess(
      viewer,
      rows.map((row) => ({ ...row, published: row.versions[0]! })),
    );
    const byId = new Map(items.map((item) => [item.id, item]));
    const found = new Map<string, SubstanceItem>();
    for (const [id, target] of resolved) {
      const item = byId.get(target);
      if (item) found.set(id, item);
    }
    return found;
  }

  /** « Signaler une erreur »: kept for the clinical team; a demo report has no account. */
  async report(
    viewer: Viewer,
    substanceId: string,
    input: { section: ProfileSection; reason: ContentReportReason; comment?: string },
  ): Promise<void> {
    const profile = await this.get(viewer, substanceId);
    if (profile.access.state === 'LOCKED') {
      throw new DomainError('FEATURE_LOCKED', 'This profile is locked for this account.', {
        lockReason: profile.access.lockReason ?? undefined,
        unlockPath: profile.access.unlockPath,
      });
    }
    const version = await this.prisma.substanceProfileVersion.findFirst({
      where: { substanceId, status: 'PUBLISHED' },
      select: { id: true },
    });
    await this.prisma.contentReport.create({
      data: {
        substanceId: profile.id,
        versionId: version?.id ?? null,
        section: input.section,
        reason: input.reason,
        comment: input.comment?.trim() || null,
        userId: viewer.accessContext === 'AUTHENTICATED' ? viewer.userId : null,
      },
    });
  }

  /**
   * Server-side search for the app (ADR-025): every word of the query must appear in the name or a
   * synonym (accent- and case-insensitive, partial words), names starting with the first word
   * first, then A–Z. Bounded pages; only published profiles of enabled substances.
   */
  async search(
    viewer: Viewer,
    input: { q: string; limit: number; offset: number },
  ): Promise<{ items: SubstanceHit[]; total: number }> {
    const words = likeWords(input.q);
    const matching = words.length
      ? Prisma.join(
          words.map((word) => Prisma.sql`s."search_text" LIKE ${`%${word}%`}`),
          ' AND ',
        )
      : Prisma.sql`TRUE`;
    const where = Prisma.sql`s."enabled" AND ${matching} AND EXISTS (
      SELECT 1 FROM "substance_profile_versions" v
      WHERE v."substance_id" = s."id" AND v."status" = 'PUBLISHED')`;
    const prefix = words[0] ? `${words[0]}%` : '%';
    const [page, counted] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s."id" FROM "substances" s WHERE ${where}
        ORDER BY (s."search_text" LIKE ${prefix}) DESC, lower(s."name_fr"), s."id"
        LIMIT ${input.limit} OFFSET ${input.offset}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS "total" FROM "substances" s WHERE ${where}`,
    ]);
    const ids = page.map((row) => row.id);
    const rows = await this.prisma.substance.findMany({
      where: { id: { in: ids } },
      include: { versions: PUBLISHED },
    });
    const byId = new Map(rows.map((row) => [row.id, { ...row, published: row.versions[0]! }]));
    const ordered = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const items = await this.withAccess(viewer, ordered);
    return {
      total: Number(counted[0]?.total ?? 0),
      items: items.map((item, index) => ({
        ...item,
        periods:
          item.access.state === 'AVAILABLE'
            ? summaries(profileContentSchema.parse(ordered[index]!.published.content))
            : null,
      })),
    };
  }

  /**
   * Every substance the viewer can see listed, for global search. Names, synonyms and access only:
   * profile content and sources are not loaded (ADR-025, measured on 5 000 substances).
   */
  async searchable(viewer: Viewer): Promise<SubstanceItem[]> {
    const rows = await this.prisma.substance.findMany({
      where: { enabled: true, versions: { some: { status: 'PUBLISHED' } } },
      select: {
        id: true,
        nameFr: true,
        nameEn: true,
        synonyms: true,
        demoSample: true,
        versions: { where: { status: 'PUBLISHED' }, select: { version: true, publishedAt: true } },
      },
    });
    return this.withAccess(
      viewer,
      rows.map((row) => ({ ...row, published: row.versions[0]! })),
    );
  }

  /** Account deletion: the person's reports stay for the clinical team, without their account. */
  async eraseUser(userId: string): Promise<void> {
    await this.prisma.contentReport.updateMany({ where: { userId }, data: { userId: null } });
  }

  /** Enabled substances with their published version. */
  private async published() {
    const rows = await this.prisma.substance.findMany({
      where: { enabled: true, versions: { some: { status: 'PUBLISHED' } } },
      include: { versions: PUBLISHED },
    });
    return rows.map((row) => ({ ...row, published: row.versions[0]! }));
  }

  /** Adds the viewer's access decision to each substance. */
  private async withAccess(
    viewer: Viewer,
    rows: {
      id: string;
      nameFr: string;
      nameEn: string | null;
      synonyms: string[];
      demoSample: boolean;
      published: { version: number; publishedAt: Date | null };
    }[],
  ): Promise<SubstanceItem[]> {
    const { decisions } = await this.access.decideItems(
      viewer,
      rows.map((row) => ({ type: 'pregnancyProfiles' as const, demoSample: row.demoSample })),
    );
    return rows.map((row, index) => ({
      id: row.id,
      nameFr: row.nameFr,
      nameEn: row.nameEn,
      synonyms: row.synonyms,
      version: row.published.version,
      publishedAt: row.published.publishedAt!,
      access: decisions[index]!,
    }));
  }

  /**
   * Looks up, in two queries, the names of every alternative among `ids`, and returns how to list
   * the alternatives of one profile: still-enabled substances only, each once; an alternative
   * merged into another substance is shown as that one (ADR-027), never as the profile itself.
   */
  private async nameIndex(
    ids: string[],
  ): Promise<(ids: string[], selfId: string) => SubstanceProfile['alternatives']> {
    const unique = [...new Set(ids)];
    const merged = unique.length
      ? await this.prisma.substance.findMany({
          where: { id: { in: unique }, mergedIntoId: { not: null } },
          select: { id: true, mergedIntoId: true },
        })
      : [];
    const target = new Map(merged.map((row) => [row.id, row.mergedIntoId!]));
    const rows = unique.length
      ? await this.prisma.substance.findMany({
          where: { id: { in: unique.map((id) => target.get(id) ?? id) }, enabled: true },
          select: { id: true, nameFr: true, nameEn: true },
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    // The content keeps the original id (the app matches it, and opening it redirects); the name
    // shown is the substance it now stands for.
    return (profileIds, selfId) => {
      const seen = new Set<string>();
      return profileIds.flatMap((id) => {
        const resolved = target.get(id) ?? id;
        const row = byId.get(resolved);
        if (!row || resolved === selfId || seen.has(resolved)) return [];
        seen.add(resolved);
        return [{ id, nameFr: row.nameFr, nameEn: row.nameEn }];
      });
    };
  }
}

/** The public fields of a source. */
export function sourceView(source: {
  id: string;
  title: string;
  publisher: string | null;
  type: ClinicalSourceType;
  edition: string | null;
  year: number | null;
  url: string | null;
}): SourceView {
  return {
    id: source.id,
    title: source.title,
    publisher: source.publisher,
    type: source.type,
    edition: source.edition,
    year: source.year,
    url: source.url,
  };
}
