import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { compareFrench } from '../../common/text/search-text.js';
import { type ClinicalSourceType, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { ClinicalReviewService } from '../clinical-review/index.js';
import {
  EMPTY_CONTENT,
  type ProfileContent,
  profileContentSchema,
  reviewProblems,
} from './pregnancy.content.js';
import { likeWords, searchTextOf } from './pregnancy.search.js';

export interface SubstanceInput {
  nameFr: string;
  nameEn?: string | null;
  atcCode?: string | null;
  synonyms?: string[];
  reason: string;
}

export interface SubstancePatch extends Partial<Omit<SubstanceInput, 'reason'>> {
  /** Visibility: set only through the reviewer's endpoint. */
  demoSample?: boolean;
  enabled?: boolean;
  reason: string;
}

export interface SourceInput {
  title: string;
  publisher?: string | null;
  type: ClinicalSourceType;
  edition?: string | null;
  year?: number | null;
  url?: string | null;
}

const PERSON = { select: { id: true, fullName: true } } as const;

const VERSION_INCLUDE = {
  authoredBy: PERSON,
  reviewedBy: PERSON,
  firstSignOffBy: PERSON,
  sources: { select: { source: true } },
  substance: { select: { id: true, nameFr: true, nameEn: true } },
} satisfies Prisma.SubstanceProfileVersionInclude;

export type AdminVersion = Prisma.SubstanceProfileVersionGetPayload<{
  include: typeof VERSION_INCLUDE;
}> & { problems: string[] };

const OPEN_STATUSES = ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'] as const;

export interface SubstanceFilter {
  q?: string;
  state?: 'PUBLISHED' | 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'NONE';
  archived?: 'active' | 'archived' | 'all';
  period?: 'T1' | 'T2' | 'T3' | 'PERIPARTUM' | 'LACTATION';
  conduct?: 'CONTRAINDICATED' | 'AVOID' | 'OCCASIONAL_USE' | 'NONE';
}
const EDITABLE_STATUSES = ['DRAFT', 'CHANGES_REQUESTED'] as const;

/**
 * Governance of « Grossesse · Allaitement » for Admin Web (ADR-019, section 25 Appendix B):
 * substances, versioned profiles DRAFT → IN_REVIEW → PUBLISHED (author ≠ reviewer), the sources
 * registry and user reports. Every mutation is audited with its reason.
 */
@Injectable()
export class PregnancyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ClinicalReviewService,
  ) {}

  // ─────────────────────────────── substances ───────────────────────────────

  async listSubstances(filter: SubstanceFilter = {}) {
    const byConduct = filter.period !== undefined && filter.conduct !== undefined;
    const rows = await this.prisma.substance.findMany({
      where: {
        ...(filter.archived === 'active' ? { enabled: true } : {}),
        ...(filter.archived === 'archived' ? { enabled: false } : {}),
        ...(filter.q
          ? {
              AND: likeWords(filter.q).map((word) => ({
                searchText: { contains: word.replace(/\\(.)/g, '$1') },
              })),
            }
          : {}),
      },
      include: {
        versions: {
          where: { status: { in: ['PUBLISHED', ...OPEN_STATUSES] } },
          select: {
            id: true,
            version: true,
            status: true,
            publishedAt: true,
            updatedAt: true,
            content: byConduct,
          },
        },
        _count: { select: { reports: { where: { resolvedAt: null } } } },
        mergedInto: { select: { id: true, nameFr: true, nameEn: true } },
      },
    });
    return rows
      .filter((row) => {
        const open = row.versions.find((version) => version.status !== 'PUBLISHED');
        const published = row.versions.find((version) => version.status === 'PUBLISHED');
        if (filter.state === 'NONE' && row.versions.length > 0) return false;
        if (filter.state === 'PUBLISHED' && !published) return false;
        if (
          filter.state &&
          !['NONE', 'PUBLISHED'].includes(filter.state) &&
          open?.status !== filter.state
        )
          return false;
        if (byConduct) {
          const current = open ?? published;
          if (!current) return false;
          const content = profileContentSchema.parse(current.content);
          const period =
            filter.period === 'LACTATION'
              ? content.lactation
              : content.pregnancy?.periods[filter.period!];
          if (!period) return false;
          if ((period.conduct ?? 'NONE') !== filter.conduct) return false;
        }
        return true;
      })
      .map((row) => ({
        ...row,
        published: row.versions.find((version) => version.status === 'PUBLISHED') ?? null,
        open: row.versions.find((version) => version.status !== 'PUBLISHED') ?? null,
        openReports: row._count.reports,
      }))
      .sort((a, b) => compareFrench(a.nameFr, b.nameFr));
  }

  async substance(id: string) {
    const row = await this.prisma.substance.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { authoredBy: PERSON, reviewedBy: PERSON, firstSignOffBy: PERSON },
        },
        _count: { select: { reports: { where: { resolvedAt: null } } } },
        mergedInto: { select: { id: true, nameFr: true, nameEn: true } },
      },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Substance not found.');
    return { ...row, openReports: row._count.reports };
  }

  async createSubstance(admin: AdminPrincipal, input: SubstanceInput, client: ClientInfo) {
    try {
      const nameFr = input.nameFr.trim();
      const nameEn = input.nameEn?.trim() || null;
      const synonyms = cleanSynonyms(input.synonyms ?? []);
      const created = await this.prisma.substance.create({
        data: {
          nameFr,
          nameEn,
          atcCode: input.atcCode?.trim().toUpperCase() || null,
          synonyms,
          searchText: searchTextOf(nameFr, nameEn, synonyms),
          createdById: admin.adminId,
          updatedById: admin.adminId,
        },
      });
      await this.record(admin, client, 'pregnancy.substance.created', 'Substance', created.id, {
        after: { nameFr: created.nameFr, nameEn: created.nameEn, atcCode: created.atcCode },
        reason: input.reason,
      });
      return this.substance(created.id);
    } catch (error) {
      throw nameTaken(error);
    }
  }

  /** Names, ATC and synonyms need `pregnancy.draft`; demo sample and enabling change who sees it. */
  async updateSubstance(
    admin: AdminPrincipal,
    id: string,
    patch: SubstancePatch,
    client: ClientInfo,
  ) {
    const before = await this.substance(id);
    if (before.mergedIntoId && patch.enabled === true) {
      throw new DomainError('INVALID_STATE', 'Undo the merge before showing this substance again.');
    }
    const visibility = patch.demoSample !== undefined || patch.enabled !== undefined;
    if (visibility && !admin.grants.includes('pregnancy.review')) {
      throw new DomainError('FORBIDDEN', 'Changing who sees a profile needs pregnancy.review.');
    }
    const data: Prisma.SubstanceUpdateInput = { updatedBy: { connect: { id: admin.adminId } } };
    if (patch.nameFr !== undefined) data.nameFr = patch.nameFr.trim();
    if (patch.nameEn !== undefined) data.nameEn = patch.nameEn?.trim() || null;
    if (patch.atcCode !== undefined) data.atcCode = patch.atcCode?.trim().toUpperCase() || null;
    if (patch.synonyms !== undefined) data.synonyms = cleanSynonyms(patch.synonyms);
    if (patch.demoSample !== undefined) data.demoSample = patch.demoSample;
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.nameFr !== undefined || patch.nameEn !== undefined || patch.synonyms !== undefined) {
      data.searchText = searchTextOf(
        (data.nameFr as string | undefined) ?? before.nameFr,
        data.nameEn !== undefined ? (data.nameEn as string | null) : before.nameEn,
        (data.synonyms as string[] | undefined) ?? before.synonyms,
      );
    }
    try {
      const updated = await this.prisma.substance.update({ where: { id }, data });
      const pick = (row: typeof updated) => ({
        nameFr: row.nameFr,
        nameEn: row.nameEn,
        atcCode: row.atcCode,
        synonyms: row.synonyms,
        demoSample: row.demoSample,
        enabled: row.enabled,
      });
      await this.record(admin, client, 'pregnancy.substance.updated', 'Substance', id, {
        before: pick(before),
        after: pick(updated),
        reason: patch.reason,
      });
    } catch (error) {
      throw nameTaken(error);
    }
    return this.substance(id);
  }

  // ──────────────────────────────── merge (ADR-027) ────────────────────────────────

  /**
   * What merging `sourceId` into `targetId` would do, and what prevents it. The source's names
   * become synonyms of the target; its profile versions stay on it as history; nothing clinical is
   * copied. Blockers are codes Admin Web translates.
   */
  async mergePreview(sourceId: string, targetId: string) {
    const [source, target] = await Promise.all([this.mergeRow(sourceId), this.mergeRow(targetId)]);
    const blockers: string[] = [];
    if (source.id === target.id) blockers.push('SAME_SUBSTANCE');
    if (source.mergedIntoId) blockers.push('SOURCE_ALREADY_MERGED');
    if (target.mergedIntoId) blockers.push('TARGET_MERGED');
    if (!target.enabled) blockers.push('TARGET_ARCHIVED');
    if (source._count.merged > 0) blockers.push('SOURCE_HAS_MERGED');
    if (source.versions.some((version) => isOpen(version.status)))
      blockers.push('SOURCE_OPEN_VERSION');
    const known = new Set(
      [target.nameFr, target.nameEn ?? '', ...target.synonyms].map((name) =>
        name.trim().toLowerCase(),
      ),
    );
    const namesToAdd = cleanSynonyms([
      source.nameFr,
      source.nameEn ?? '',
      ...source.synonyms,
    ]).filter((name) => !known.has(name.toLowerCase()));
    if (target.synonyms.length + namesToAdd.length > 30) blockers.push('TOO_MANY_SYNONYMS');
    const published = source.versions.find((version) => version.status === 'PUBLISHED') ?? null;
    return {
      source: { id: source.id, nameFr: source.nameFr, nameEn: source.nameEn },
      target: { id: target.id, nameFr: target.nameFr, nameEn: target.nameEn },
      namesToAdd,
      sourcePublishedVersion: published?.version ?? null,
      blockers,
    };
  }

  /** Merges a duplicate: one transaction, audited on both substances. */
  async merge(
    admin: AdminPrincipal,
    sourceId: string,
    input: { into: string; reason: string; acknowledgeHiddenProfile: boolean },
    client: ClientInfo,
  ) {
    const preview = await this.mergePreview(sourceId, input.into);
    if (preview.blockers.length > 0) {
      throw new DomainError('INVALID_STATE', 'This merge is not possible.', {
        fields: { merge: preview.blockers },
      });
    }
    if (preview.sourcePublishedVersion !== null && !input.acknowledgeHiddenProfile) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Confirm that the published profile will no longer be shown.',
        {
          fields: { acknowledgeHiddenProfile: ['required'] },
        },
      );
    }
    const [source, target] = await Promise.all([
      this.mergeRow(sourceId),
      this.mergeRow(input.into),
    ]);
    const synonyms = [...target.synonyms, ...preview.namesToAdd];
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Guarded: only a substance still unmerged is merged (two reviewers at once).
      const { count } = await tx.substance.updateMany({
        where: { id: sourceId, mergedIntoId: null },
        data: {
          enabled: false,
          mergedIntoId: target.id,
          mergedNames: preview.namesToAdd,
          mergedAt: now,
          mergedById: admin.adminId,
          updatedById: admin.adminId,
        },
      });
      if (count !== 1)
        throw new DomainError('VERSION_CONFLICT', 'This substance was merged meanwhile.');
      await tx.substance.update({
        where: { id: target.id },
        data: {
          synonyms,
          searchText: searchTextOf(target.nameFr, target.nameEn, synonyms),
          updatedBy: { connect: { id: admin.adminId } },
        },
      });
    });
    await this.record(admin, client, 'pregnancy.substance.merged', 'Substance', sourceId, {
      before: { enabled: source.enabled, mergedIntoId: null },
      after: {
        enabled: false,
        mergedIntoId: target.id,
        hiddenPublishedVersion: preview.sourcePublishedVersion,
      },
      reason: input.reason,
    });
    await this.record(
      admin,
      client,
      'pregnancy.substance.synonyms_merged',
      'Substance',
      target.id,
      {
        before: { synonyms: target.synonyms },
        after: { synonyms, from: sourceId },
        reason: input.reason,
      },
    );
    return this.substance(sourceId);
  }

  /**
   * Undoes a merge: the names it added leave the target, the duplicate stands alone again. It stays
   * archived: showing it again is a separate visibility decision.
   */
  async unmerge(admin: AdminPrincipal, sourceId: string, reason: string, client: ClientInfo) {
    const source = await this.mergeRow(sourceId);
    if (!source.mergedIntoId)
      throw new DomainError('INVALID_STATE', 'This substance is not merged.');
    const target = await this.mergeRow(source.mergedIntoId);
    const added = new Set(source.mergedNames.map((name) => name.toLowerCase()));
    const synonyms = target.synonyms.filter((name) => !added.has(name.toLowerCase()));
    await this.prisma.$transaction([
      this.prisma.substance.update({
        where: { id: target.id },
        data: {
          synonyms,
          searchText: searchTextOf(target.nameFr, target.nameEn, synonyms),
          updatedBy: { connect: { id: admin.adminId } },
        },
      }),
      this.prisma.substance.update({
        where: { id: sourceId },
        data: {
          mergedIntoId: null,
          mergedNames: [],
          mergedAt: null,
          mergedById: null,
          updatedById: admin.adminId,
        },
      }),
    ]);
    await this.record(admin, client, 'pregnancy.substance.unmerged', 'Substance', sourceId, {
      before: { mergedIntoId: target.id, mergedNames: source.mergedNames },
      after: { mergedIntoId: null, enabled: false },
      reason,
    });
    await this.record(
      admin,
      client,
      'pregnancy.substance.synonyms_unmerged',
      'Substance',
      target.id,
      {
        before: { synonyms: target.synonyms },
        after: { synonyms, from: sourceId },
        reason,
      },
    );
    return this.substance(sourceId);
  }

  private async mergeRow(id: string) {
    const row = await this.prisma.substance.findUnique({
      where: { id },
      include: {
        versions: { select: { version: true, status: true } },
        _count: { select: { merged: true } },
      },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Substance not found.');
    return row;
  }

  // ──────────────────────────────── versions ────────────────────────────────

  /** « Nouvelle version »: starts from the published profile, or empty for a first profile. */
  async createVersion(
    admin: AdminPrincipal,
    substanceId: string,
    reason: string,
    client: ClientInfo,
  ) {
    const substance = await this.substance(substanceId);
    if (substance.mergedIntoId) {
      throw new DomainError(
        'INVALID_STATE',
        'A merged duplicate gets no new version; edit the substance kept.',
      );
    }
    if (substance.versions.some((version) => isOpen(version.status))) {
      throw new DomainError('INVALID_STATE', 'This substance already has a version in progress.');
    }
    const published = await this.prisma.substanceProfileVersion.findFirst({
      where: { substanceId, status: 'PUBLISHED' },
      include: { sources: { select: { sourceId: true } } },
    });
    const next = (substance.versions[0]?.version ?? 0) + 1;
    const created = await this.prisma.substanceProfileVersion.create({
      data: {
        substanceId,
        version: next,
        content: (published?.content ?? EMPTY_CONTENT) as Prisma.InputJsonObject,
        changeReason: reason,
        authoredById: admin.adminId,
        sources: { create: (published?.sources ?? []).map(({ sourceId }) => ({ sourceId })) },
      },
    });
    await this.record(
      admin,
      client,
      'pregnancy.version.created',
      'SubstanceProfileVersion',
      created.id,
      {
        after: { substanceId, version: next, from: published?.version ?? null },
        reason,
      },
    );
    return this.version(created.id);
  }

  async version(versionId: string): Promise<AdminVersion> {
    const row = await this.prisma.substanceProfileVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Profile version not found.');
    const open = (OPEN_STATUSES as readonly string[]).includes(row.status);
    return {
      ...row,
      requiredSignOffs: open
        ? await this.review.requiredFor('PREGNANCY_PROFILE', row)
        : row.requiredSignOffs,
      problems: await this.problemsOf(row),
    };
  }

  /** Saves the draft as written: incomplete is fine until submission. */
  async saveVersion(
    admin: AdminPrincipal,
    versionId: string,
    input: { content: unknown; sourceIds: string[] },
    client: ClientInfo,
  ) {
    const current = await this.version(versionId);
    this.assertAuthor(admin, current);
    this.assertStatus(current.status, EDITABLE_STATUSES, 'Only a draft can be edited.');
    const parsed = profileContentSchema.safeParse(input.content);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'The profile does not match its structure.', {
        fields: Object.fromEntries(
          parsed.error.issues.map((issue) => [`content.${issue.path.join('.')}`, [issue.message]]),
        ),
      });
    }
    const sourceIds = [...new Set(input.sourceIds)];
    const known = await this.prisma.clinicalSource.count({ where: { id: { in: sourceIds } } });
    if (known !== sourceIds.length) {
      throw new DomainError('VALIDATION_FAILED', 'Unknown source.', {
        fields: { sourceIds: ['Unknown source.'] },
      });
    }
    await this.prisma.$transaction([
      this.prisma.profileVersionSource.deleteMany({ where: { versionId } }),
      this.prisma.substanceProfileVersion.update({
        where: { id: versionId },
        data: {
          content: parsed.data,
          sources: { create: sourceIds.map((sourceId) => ({ sourceId })) },
        },
      }),
    ]);
    await this.record(
      admin,
      client,
      'pregnancy.version.saved',
      'SubstanceProfileVersion',
      versionId,
      {
        after: { sourceIds },
      },
    );
    return this.version(versionId);
  }

  async submit(admin: AdminPrincipal, versionId: string, reason: string, client: ClientInfo) {
    const current = await this.version(versionId);
    this.assertAuthor(admin, current);
    this.assertStatus(current.status, EDITABLE_STATUSES, 'Only a draft can be submitted.');
    if (current.problems.length > 0) {
      throw new DomainError('INVALID_STATE', 'The profile is not complete.', {
        fields: { content: current.problems },
      });
    }
    await this.prisma.substanceProfileVersion.update({
      where: { id: versionId },
      data: {
        status: 'IN_REVIEW',
        submittedAt: new Date(),
        changeReason: reason,
        requiredSignOffs: await this.review.required('PREGNANCY_PROFILE'),
      },
    });
    await this.record(
      admin,
      client,
      'pregnancy.version.submitted',
      'SubstanceProfileVersion',
      versionId,
      {
        reason,
      },
    );
    return this.version(versionId);
  }

  /**
   * Approves. When two sign-offs are required and none is recorded yet, records the first one
   * (ADR-024); otherwise publishes, and the previous published version is superseded in the same
   * step.
   */
  async approve(admin: AdminPrincipal, versionId: string, comment: string, client: ClientInfo) {
    const current = await this.version(versionId);
    this.assertReviewer(admin, current);
    this.assertStatus(current.status, ['IN_REVIEW'], 'Only a version in review can be approved.');
    const approval = await this.review.approval('PREGNANCY_PROFILE', current, admin);
    if (!approval.publish) {
      await this.prisma.substanceProfileVersion.update({
        where: { id: versionId },
        data: {
          requiredSignOffs: 2,
          firstSignOffById: admin.adminId,
          firstSignOffAt: new Date(),
          firstSignOffNote: comment,
        },
      });
      await this.record(
        admin,
        client,
        'pregnancy.version.signed_off',
        'SubstanceProfileVersion',
        versionId,
        {
          after: { version: current.version, signOff: 1, requiredSignOffs: 2 },
          reason: comment,
        },
      );
      return this.version(versionId);
    }
    const now = new Date();
    const previous = await this.prisma.$transaction(async (tx) => {
      const superseded = await tx.substanceProfileVersion.findFirst({
        where: { substanceId: current.substanceId, status: 'PUBLISHED' },
        select: { id: true, version: true },
      });
      if (superseded) {
        await tx.substanceProfileVersion.update({
          where: { id: superseded.id },
          data: { status: 'SUPERSEDED' },
        });
      }
      await tx.substanceProfileVersion.update({
        where: { id: versionId },
        data: {
          status: 'PUBLISHED',
          reviewedById: admin.adminId,
          reviewedAt: now,
          reviewComment: comment,
          requiredSignOffs: approval.requiredSignOffs,
          publishedAt: now,
        },
      });
      return superseded;
    });
    await this.record(
      admin,
      client,
      'pregnancy.version.published',
      'SubstanceProfileVersion',
      versionId,
      {
        after: {
          version: current.version,
          supersedes: previous?.version ?? null,
          firstSignOffById: current.firstSignOffById,
        },
        reason: comment,
      },
    );
    return this.version(versionId);
  }

  async requestChanges(
    admin: AdminPrincipal,
    versionId: string,
    comment: string,
    client: ClientInfo,
  ) {
    const current = await this.version(versionId);
    this.assertReviewer(admin, current);
    this.assertStatus(current.status, ['IN_REVIEW'], 'Only a version in review can be sent back.');
    await this.prisma.substanceProfileVersion.update({
      where: { id: versionId },
      // Changed content is signed again from the start.
      data: {
        status: 'CHANGES_REQUESTED',
        reviewComment: comment,
        firstSignOffById: null,
        firstSignOffAt: null,
        firstSignOffNote: null,
      },
    });
    await this.record(
      admin,
      client,
      'pregnancy.version.changes_requested',
      'SubstanceProfileVersion',
      versionId,
      {
        reason: comment,
      },
    );
    return this.version(versionId);
  }

  /** Drops a draft that will not be published; versions in review or published are kept. */
  async discard(admin: AdminPrincipal, versionId: string, reason: string, client: ClientInfo) {
    const current = await this.version(versionId);
    this.assertAuthor(admin, current);
    this.assertStatus(current.status, EDITABLE_STATUSES, 'Only a draft can be discarded.');
    await this.prisma.substanceProfileVersion.delete({ where: { id: versionId } });
    await this.record(
      admin,
      client,
      'pregnancy.version.discarded',
      'SubstanceProfileVersion',
      versionId,
      {
        before: { substanceId: current.substanceId, version: current.version },
        reason,
      },
    );
  }

  // ───────────────────────────────── sources ─────────────────────────────────

  listSources() {
    return this.prisma.clinicalSource.findMany({ orderBy: [{ title: 'asc' }, { year: 'desc' }] });
  }

  async createSource(admin: AdminPrincipal, input: SourceInput, client: ClientInfo) {
    const created = await this.prisma.clinicalSource.create({
      data: { ...normaliseSource(input), createdById: admin.adminId },
    });
    await this.record(admin, client, 'pregnancy.source.created', 'ClinicalSource', created.id, {
      after: normaliseSource(input),
    });
    return created;
  }

  /** Corrects a source; every version citing it shows the correction (title, edition, link). */
  async updateSource(admin: AdminPrincipal, id: string, input: SourceInput, client: ClientInfo) {
    const before = await this.prisma.clinicalSource.findUnique({ where: { id } });
    if (!before) throw new DomainError('NOT_FOUND', 'Source not found.');
    const updated = await this.prisma.clinicalSource.update({
      where: { id },
      data: normaliseSource(input),
    });
    await this.record(admin, client, 'pregnancy.source.updated', 'ClinicalSource', id, {
      before: normaliseSource(before),
      after: normaliseSource(input),
    });
    return updated;
  }

  // ───────────────────────────────── reports ─────────────────────────────────

  listReports(filter: { open: boolean; substanceId?: string }) {
    return this.prisma.contentReport.findMany({
      where: {
        ...(filter.open ? { resolvedAt: null } : {}),
        ...(filter.substanceId ? { substanceId: filter.substanceId } : {}),
      },
      include: {
        substance: { select: { id: true, nameFr: true, nameEn: true } },
        version: { select: { version: true } },
        resolvedBy: PERSON,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async resolveReport(admin: AdminPrincipal, id: string, resolution: string, client: ClientInfo) {
    const { count } = await this.prisma.contentReport.updateMany({
      where: { id, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: admin.adminId, resolution },
    });
    if (count === 0) throw new DomainError('INVALID_STATE', 'This report is already resolved.');
    await this.record(admin, client, 'pregnancy.report.resolved', 'ContentReport', id, {
      reason: resolution,
    });
  }

  /** Open reports and versions waiting for a reviewer (Admin Web overview). */
  /**
   * Bulk submit / approve: each version goes through the single-version rules (author ≠ reviewer,
   * review gate, sign-offs); one failure does not stop the others and is reported with its code.
   */
  async many(
    ids: string[],
    action: (id: string) => Promise<unknown>,
  ): Promise<{ versionId: string; ok: boolean; code?: string }[]> {
    const results: { versionId: string; ok: boolean; code?: string }[] = [];
    for (const versionId of [...new Set(ids)]) {
      try {
        await action(versionId);
        results.push({ versionId, ok: true });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        results.push({ versionId, ok: false, code: error.code });
      }
    }
    return results;
  }

  async pending() {
    const [reports, inReview] = await Promise.all([
      this.prisma.contentReport.count({ where: { resolvedAt: null } }),
      this.prisma.substanceProfileVersion.count({ where: { status: 'IN_REVIEW' } }),
    ]);
    return { reports, inReview };
  }

  // ───────────────────────────────── helpers ─────────────────────────────────

  private async problemsOf(row: {
    substanceId: string;
    content: Prisma.JsonValue;
    sources: { source: { id: string } }[];
  }): Promise<string[]> {
    const parsed = profileContentSchema.safeParse(row.content);
    if (!parsed.success) return ['content: the stored profile does not match its structure'];
    const content: ProfileContent = parsed.data;
    const known = await this.prisma.substance.findMany({ select: { id: true } });
    return reviewProblems(content, {
      substanceId: row.substanceId,
      sourceIds: row.sources.map(({ source }) => source.id),
      knownSubstanceIds: new Set(known.map(({ id }) => id)),
    });
  }

  private assertAuthor(admin: AdminPrincipal, version: { authoredById: string }) {
    if (version.authoredById !== admin.adminId) {
      throw new DomainError('FORBIDDEN', 'Only the author edits, submits or discards a draft.');
    }
  }

  private assertReviewer(admin: AdminPrincipal, version: { authoredById: string }) {
    if (version.authoredById === admin.adminId) {
      throw new DomainError('FORBIDDEN', 'A version is never reviewed by its author.');
    }
  }

  private assertStatus(status: string, allowed: readonly string[], message: string) {
    if (!allowed.includes(status)) throw new DomainError('INVALID_STATE', message);
  }

  private record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    entityType: string,
    entityId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue; reason?: string },
  ) {
    return this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action,
      entityType,
      entityId,
      before: change.before,
      after: change.after,
      reason: change.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}

function isOpen(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

function cleanSynonyms(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const term = value.trim().replace(/\s+/g, ' ');
    const key = term.toLowerCase();
    if (term && !seen.has(key)) {
      seen.add(key);
      result.push(term);
    }
  }
  return result;
}

function normaliseSource(input: SourceInput) {
  return {
    title: input.title.trim(),
    publisher: input.publisher?.trim() || null,
    type: input.type,
    edition: input.edition?.trim() || null,
    year: input.year ?? null,
    url: input.url?.trim() || null,
  };
}

function nameTaken(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new DomainError('VALIDATION_FAILED', 'A substance already has this name.', {
      fields: { nameFr: ['A substance already has this name.'] },
    });
  }
  return error;
}
