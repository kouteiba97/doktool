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
import { alternativeIds, type ProfileContent, profileContentSchema } from './pregnancy.content.js';

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
    const alternatives = content ? await this.names(alternativeIds(content)) : [];
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

  /** Every substance the viewer can see listed, for global search. */
  async searchable(viewer: Viewer): Promise<SubstanceItem[]> {
    return this.withAccess(viewer, await this.published());
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

  /** Names of the alternatives that are still enabled; a disabled one is left out. */
  private async names(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.substance.findMany({
      where: { id: { in: ids }, enabled: true },
      select: { id: true, nameFr: true, nameEn: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
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
