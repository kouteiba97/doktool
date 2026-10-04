import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { compareFrench } from '../../common/text/search-text.js';
import { type ClinicalSourceType, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import {
  EMPTY_CONTENT,
  type ProfileContent,
  profileContentSchema,
  reviewProblems,
} from './pregnancy.content.js';

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
  sources: { select: { source: true } },
  substance: { select: { id: true, nameFr: true, nameEn: true } },
} satisfies Prisma.SubstanceProfileVersionInclude;

export type AdminVersion = Prisma.SubstanceProfileVersionGetPayload<{
  include: typeof VERSION_INCLUDE;
}> & { problems: string[] };

const OPEN_STATUSES = ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'] as const;
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
  ) {}

  // ─────────────────────────────── substances ───────────────────────────────

  async listSubstances() {
    const rows = await this.prisma.substance.findMany({
      include: {
        versions: {
          where: { status: { in: ['PUBLISHED', ...OPEN_STATUSES] } },
          select: { id: true, version: true, status: true, publishedAt: true, updatedAt: true },
        },
        _count: { select: { reports: { where: { resolvedAt: null } } } },
      },
    });
    return rows
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
          include: { authoredBy: PERSON, reviewedBy: PERSON },
        },
        _count: { select: { reports: { where: { resolvedAt: null } } } },
      },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Substance not found.');
    return { ...row, openReports: row._count.reports };
  }

  async createSubstance(admin: AdminPrincipal, input: SubstanceInput, client: ClientInfo) {
    try {
      const created = await this.prisma.substance.create({
        data: {
          nameFr: input.nameFr.trim(),
          nameEn: input.nameEn?.trim() || null,
          atcCode: input.atcCode?.trim().toUpperCase() || null,
          synonyms: cleanSynonyms(input.synonyms ?? []),
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

  // ──────────────────────────────── versions ────────────────────────────────

  /** « Nouvelle version »: starts from the published profile, or empty for a first profile. */
  async createVersion(
    admin: AdminPrincipal,
    substanceId: string,
    reason: string,
    client: ClientInfo,
  ) {
    const substance = await this.substance(substanceId);
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
    return { ...row, problems: await this.problemsOf(row) };
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
      data: { status: 'IN_REVIEW', submittedAt: new Date(), changeReason: reason },
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

  /** Approves and publishes; the previous published version is superseded in the same step. */
  async approve(admin: AdminPrincipal, versionId: string, comment: string, client: ClientInfo) {
    const current = await this.version(versionId);
    this.assertReviewer(admin, current);
    this.assertStatus(current.status, ['IN_REVIEW'], 'Only a version in review can be approved.');
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
        after: { version: current.version, supersedes: previous?.version ?? null },
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
      data: { status: 'CHANGES_REQUESTED', reviewComment: comment },
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
