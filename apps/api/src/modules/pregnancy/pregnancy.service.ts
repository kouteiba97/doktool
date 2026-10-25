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

export interface SubstanceHit extends SubstanceItem {
  /** Per period of the published profile; null while locked (no content for a locked item). */
  periods: Record<SummaryTarget, PeriodSummary | null> | null;
}

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
    const alternatives = content ? await this.names(alternativeIds(content), row.id) : [];
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

  /** The profiles this viewer may open, in full, for the offline store (Lock L44). */
  async openable(viewer: Viewer): Promise<SubstanceProfile[]> {
    const items = (await this.list(viewer)).filter((item) => item.access.state === 'AVAILABLE');
    return Promise.all(items.map((item) => this.get(viewer, item.id)));
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

  private async published() {
    const rows = await this.prisma.substance.findMany({
      where: { enabled: true, versions: { some: { status: 'PUBLISHED' } } },
      include: { versions: PUBLISHED },
    });
    return rows.map((row) => ({ ...row, published: row.versions[0]! }));
  }

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
   * Names of the alternatives that are still enabled; a disabled one is left out. An alternative
   * merged into another substance is shown as that one (ADR-027), never as the profile itself.
   */
  private async names(ids: string[], selfId: string) {
    if (ids.length === 0) return [];
    const merged = await this.prisma.substance.findMany({
      where: { id: { in: ids }, mergedIntoId: { not: null } },
      select: { id: true, mergedIntoId: true },
    });
    const target = new Map(merged.map((row) => [row.id, row.mergedIntoId!]));
    const rows = await this.prisma.substance.findMany({
      where: { id: { in: ids.map((id) => target.get(id) ?? id) }, enabled: true },
      select: { id: true, nameFr: true, nameEn: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    // The content keeps the original id (the app matches it, and opening it redirects); the name
    // shown is the substance it now stands for.
    const seen = new Set<string>();
    return ids.flatMap((id) => {
      const resolved = target.get(id) ?? id;
      const row = byId.get(resolved);
      if (!row || resolved === selfId || seen.has(resolved)) return [];
      seen.add(resolved);
      return [{ id, nameFr: row.nameFr, nameEn: row.nameEn }];
    });
  }
}

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
