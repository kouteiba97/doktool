import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { normaliseForSearch } from '../../common/text/search-text.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { applyRows } from './import/apply.js';
import {
  type CheckedRow,
  checkRows,
  type ColumnMapping,
  detectColumns,
  FIELDS,
  findHeaderRow,
  STATUS_TARGETS,
  type Library,
  type LibrarySubstance,
  libraryOf,
  missingColumns,
  PARSER_VERSION,
  type RowInput,
  type RowValues,
  type StatusMapping,
  statusKey,
  type Summary,
  summarise,
  valuesOf,
} from './import/rows.js';
import { type Cell, readWorkbook } from './import/workbook.js';
import { EMPTY_CONTENT, type ProfileContent, profileContentSchema } from './pregnancy.content.js';
import { searchTextOf } from './pregnancy.search.js';

export const ROW_FILTERS = [
  'ALL',
  'ERROR',
  'WARNING',
  'VALID',
  'EXCLUDED',
  'DUPLICATE',
  'CONFLICT',
] as const;
export type RowFilter = (typeof ROW_FILTERS)[number];

const IMPORT_RATE_LIMIT = { name: 'pregnancy-import:admin', limit: 30, windowSeconds: 3600 };
const OPEN = ['DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW'] as const;
const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'];

interface HeaderInfo {
  names: (string | null)[];
  headerRow: number;
  otherSheets: string[];
}

export interface StatusWord {
  key: string;
  /** The word as written the first time it appears. */
  sample: string;
  rows: number;
  mappedTo: StatusMapping[string] | null;
}

export interface CommitResult {
  substancesCreated: number;
  versionsCreated: number;
  versionsUpdated: number;
  sourcesCreated: number;
  rowsWritten: number;
  rowsSkipped: number;
  versionIds: string[];
}

type BatchRow = Prisma.PregnancyImportBatchGetPayload<{
  include: {
    uploadedBy: { select: { id: true; fullName: true } };
    committedBy: { select: { id: true; fullName: true } };
  };
}>;

export interface BatchView {
  batch: BatchRow;
  headers: HeaderInfo;
  missingColumns: string[];
  statuses: StatusWord[];
  summary: Summary;
  rows: {
    items: (Omit<Prisma.PregnancyImportRowGetPayload<object>, 'issues'> & {
      issues: CheckedRow['issues'];
    })[];
    total: number;
  };
}

interface AuditItem {
  action: string;
  entityType: string;
  entityId: string;
  after: unknown;
}

const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Spreadsheet import into « Grossesse · Allaitement » (ADR-025). A batch is a preview until its
 * commit, which writes drafts (never published content) in one transaction, at most once.
 */
@Injectable()
export class PregnancyImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
  ) {}

  // ─────────────────────────────── upload ───────────────────────────────

  async upload(
    admin: AdminPrincipal,
    file: { originalname: string; buffer: Buffer },
    client: ClientInfo,
  ): Promise<string> {
    await this.limiter.hit(IMPORT_RATE_LIMIT, admin.adminId);
    const sha256 = hash(file.buffer);
    // The same file uploaded again by the same admin reopens its preview instead of a copy.
    const open = await this.prisma.pregnancyImportBatch.findFirst({
      where: { fileSha256: sha256, uploadedById: admin.adminId, status: 'PREVIEW' },
      select: { id: true },
    });
    if (open) return open.id;

    const workbook = await readWorkbook(file.buffer);
    const headerRow = findHeaderRow(workbook.rows);
    if (headerRow < 0)
      throw new DomainError('UPLOAD_INVALID', 'No header row found in the first ten rows.', {
        fields: { file: ['No header row found in the first ten rows.'] },
      });
    const names = workbook.rows[headerRow]!.map((cell) => cell.text);
    const columns = detectColumns(names);
    const dataRows = workbook.rows
      .map((cells, index) => ({ cells, rowNumber: index + 1 }))
      .slice(headerRow + 1)
      .filter(({ cells }) => cells.some((cell) => cell.text || cell.hyperlink));
    if (dataRows.length === 0)
      throw new DomainError('UPLOAD_INVALID', 'The sheet has no data row.', {
        fields: { file: ['The sheet has no data row.'] },
      });

    const fileName =
      file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200) || 'import.xlsx';
    const headers: HeaderInfo = {
      names,
      headerRow: headerRow + 1,
      otherSheets: workbook.otherSheets,
    };
    const batch = await this.prisma.pregnancyImportBatch.create({
      data: {
        fileName,
        fileSha256: sha256,
        fileBytes: file.buffer.length,
        sheetName: workbook.sheetName.slice(0, 200),
        parserVersion: PARSER_VERSION,
        headers: json(headers),
        columns: json(columns),
        statusMapping: json({}),
        uploadedById: admin.adminId,
        rows: {
          createMany: {
            data: dataRows.map(({ cells, rowNumber }) => ({
              rowNumber,
              original: json(cells),
              values: json(valuesOf(cells, columns)),
            })),
          },
        },
      },
    });
    await this.recheck(batch.id, admin.adminId);
    await this.record(admin, client, 'pregnancy.import.uploaded', batch.id, {
      after: {
        fileName,
        sha256,
        bytes: file.buffer.length,
        sheet: workbook.sheetName,
        rows: dataRows.length,
      },
    });
    return batch.id;
  }

  // ─────────────────────────────── reading ───────────────────────────────

  async list(limit: number, offset: number) {
    const [items, total] = await Promise.all([
      this.prisma.pregnancyImportBatch.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          uploadedBy: { select: { id: true, fullName: true } },
          committedBy: { select: { id: true, fullName: true } },
          _count: { select: { rows: true } },
        },
      }),
      this.prisma.pregnancyImportBatch.count(),
    ]);
    return { items, total };
  }

  async view(id: string, filter: RowFilter, limit: number, offset: number): Promise<BatchView> {
    const current = await this.prisma.pregnancyImportBatch.findUnique({
      where: { id },
      select: { status: true, uploadedById: true },
    });
    if (!current) throw new DomainError('NOT_FOUND', 'Import not found.');
    // The library may have changed since the last check: a preview always shows today's issues.
    if (current.status === 'PREVIEW') await this.recheck(id, current.uploadedById);
    const batch = await this.prisma.pregnancyImportBatch.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
        committedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!batch) throw new DomainError('NOT_FOUND', 'Import not found.');
    const rows = await this.prisma.pregnancyImportRow.findMany({
      where: { batchId: id },
      orderBy: { rowNumber: 'asc' },
    });
    const issuesOf = (row: (typeof rows)[number]) => row.issues as unknown as CheckedRow['issues'];
    const summary = summarise(
      rows.map(toInput),
      rows.map((row) => ({ issues: issuesOf(row) })),
    );

    const matches = (row: (typeof rows)[number]) => {
      const issues = issuesOf(row);
      switch (filter) {
        case 'ALL':
          return true;
        case 'EXCLUDED':
          return row.excluded;
        case 'ERROR':
          return !row.excluded && issues.some((i) => i.severity === 'ERROR');
        case 'WARNING':
          return !row.excluded && issues.some((i) => i.severity === 'WARNING');
        case 'VALID':
          return !row.excluded && !issues.some((i) => i.severity === 'ERROR');
        case 'DUPLICATE':
          return issues.some((i) => i.code === 'DUPLICATE_ROW');
        case 'CONFLICT':
          return issues.some((i) => i.code.startsWith('CONFLICT_'));
      }
    };
    const filtered = rows.filter(matches);
    const mapping = batch.statusMapping as StatusMapping;
    const words = new Map<string, StatusWord>();
    for (const row of rows) {
      if (row.excluded) continue;
      const raw = (row.values as RowValues).status;
      const key = statusKey(raw);
      if (!key) continue;
      const word = words.get(key) ?? {
        key,
        sample: raw!.trim(),
        rows: 0,
        mappedTo: mapping[key] ?? null,
      };
      word.rows++;
      words.set(key, word);
    }
    return {
      batch,
      headers: batch.headers as unknown as HeaderInfo,
      missingColumns: missingColumns(batch.columns as ColumnMapping),
      statuses: [...words.values()].sort((a, b) => b.rows - a.rows || a.key.localeCompare(b.key)),
      summary,
      rows: {
        items: filtered
          .slice(offset, offset + limit)
          .map((row) => ({ ...row, issues: issuesOf(row) })),
        total: filtered.length,
      },
    };
  }

  // ─────────────────────────────── corrections ───────────────────────────────

  /** Column and status mapping. Rows the admin has not edited are re-read from their cells. */
  async setMapping(
    admin: AdminPrincipal,
    id: string,
    input: { revision: number; columns?: ColumnMapping; statuses?: StatusMapping },
    client: ClientInfo,
  ): Promise<void> {
    const batch = await this.editable(id, input.revision);
    const columns = input.columns ?? (batch.columns as ColumnMapping);
    const width = (batch.headers as unknown as HeaderInfo).names.length;
    if (Object.keys(columns).some((key) => !/^\d+$/.test(key) || Number(key) >= width))
      throw new DomainError('VALIDATION_FAILED', 'Unknown column.', {
        fields: { columns: ['Unknown column.'] },
      });
    const fieldNames: readonly string[] = [...FIELDS, 'ignore'];
    if (Object.values(columns).some((field) => !fieldNames.includes(field)))
      throw new DomainError('VALIDATION_FAILED', 'Unknown field.', {
        fields: { columns: ['Unknown field.'] },
      });
    if (
      Object.values(input.statuses ?? {}).some(
        (target) => !(STATUS_TARGETS as readonly string[]).includes(target),
      )
    )
      throw new DomainError('VALIDATION_FAILED', 'Unknown conduct.', {
        fields: { statuses: ['Unknown conduct.'] },
      });
    const used = Object.values(columns).filter((field) => field !== 'ignore');
    if (new Set(used).size !== used.length)
      throw new DomainError('VALIDATION_FAILED', 'A field is mapped to two columns.', {
        fields: { columns: ['A field is mapped to two columns.'] },
      });
    const statuses = { ...(batch.statusMapping as StatusMapping), ...(input.statuses ?? {}) };

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, id, input.revision, {
        columns: json(columns),
        statusMapping: json(statuses),
      });
      if (input.columns) {
        const rows = await tx.pregnancyImportRow.findMany({
          where: { batchId: id, edited: false },
        });
        for (const row of rows) {
          await tx.pregnancyImportRow.update({
            where: { id: row.id },
            data: { values: json(valuesOf(row.original as unknown as Cell[], columns)) },
          });
        }
      }
    });
    await this.recheck(id, admin.adminId);
    await this.record(admin, client, 'pregnancy.import.mapping_changed', id, {
      before: { columns: batch.columns, statuses: batch.statusMapping },
      after: { columns, statuses },
    });
  }

  async updateRow(
    admin: AdminPrincipal,
    id: string,
    rowId: string,
    input: {
      revision: number;
      values?: Partial<RowValues>;
      excluded?: boolean;
      resolution?: 'UPDATE' | 'SKIP' | null;
    },
    client: ClientInfo,
  ): Promise<void> {
    await this.editable(id, input.revision);
    const row = await this.prisma.pregnancyImportRow.findFirst({
      where: { id: rowId, batchId: id },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Row not found.');
    const before = { values: row.values, excluded: row.excluded, resolution: row.resolution };
    const values = { ...(row.values as RowValues) };
    if (input.values) {
      for (const field of FIELDS) {
        const value = input.values[field];
        if (value !== undefined)
          values[field] =
            value === null ? null : value.replace(/\s+/g, ' ').trim().slice(0, 2000) || null;
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, id, input.revision, {});
      await tx.pregnancyImportRow.update({
        where: { id: rowId },
        data: {
          values: json(values),
          edited: row.edited || input.values !== undefined,
          ...(input.excluded !== undefined ? { excluded: input.excluded } : {}),
          ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
        },
      });
    });
    await this.recheck(id, admin.adminId);
    await this.record(admin, client, 'pregnancy.import.row_changed', id, {
      before: { row: row.rowNumber, ...before },
      after: {
        row: row.rowNumber,
        values,
        excluded: input.excluded ?? row.excluded,
        resolution: input.resolution ?? row.resolution,
      },
    });
  }

  async discard(
    admin: AdminPrincipal,
    id: string,
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    const batch = await this.prisma.pregnancyImportBatch.findUnique({ where: { id } });
    if (!batch) throw new DomainError('NOT_FOUND', 'Import not found.');
    if (batch.status !== 'PREVIEW')
      throw new DomainError('INVALID_STATE', `This import is ${batch.status}.`);
    await this.prisma.pregnancyImportBatch.update({
      where: { id },
      data: { status: 'DISCARDED', discardedAt: new Date(), reason },
    });
    await this.record(admin, client, 'pregnancy.import.discarded', id, { reason });
  }

  // ─────────────────────────────── commit ───────────────────────────────

  /**
   * Writes the batch as drafts, all or nothing. The batch row is locked; a second call (double
   * click, retry) returns the stored result. The admin names the revision they reviewed, so a
   * change made meanwhile in another tab is never committed unseen.
   */
  async commit(
    admin: AdminPrincipal,
    id: string,
    input: { revision: number; reason: string },
    client: ClientInfo,
  ): Promise<CommitResult> {
    const outcome = await this.prisma
      .$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<
            { status: string; revision: number; summary: unknown }[]
          >`
          SELECT "status", "revision", "summary" FROM "pregnancy_import_batches" WHERE "id" = ${id}::uuid FOR UPDATE`;
          const batch = locked[0];
          if (!batch) throw new DomainError('NOT_FOUND', 'Import not found.');
          if (batch.status === 'COMMITTED')
            return {
              result: (batch.summary as { result: CommitResult }).result,
              audits: [] as AuditItem[],
              fresh: false,
            };
          if (batch.status !== 'PREVIEW')
            throw new DomainError('INVALID_STATE', `This import is ${batch.status}.`);
          if (batch.revision !== input.revision)
            throw new DomainError('VERSION_CONFLICT', 'The import changed since you reviewed it.', {
              fields: { revision: [String(batch.revision)] },
            });

          const mapping = (
            await tx.pregnancyImportBatch.findUniqueOrThrow({
              where: { id },
              select: { statusMapping: true },
            })
          ).statusMapping as StatusMapping;
          const rows = await tx.pregnancyImportRow.findMany({
            where: { batchId: id },
            orderBy: { rowNumber: 'asc' },
          });
          const inputs = rows.map(toInput);
          const library = await loadLibrary(tx);
          const checked = checkRows(inputs, mapping, libraryOf(library), admin.adminId);
          const failing = checked.filter(
            (row, index) => !inputs[index]!.excluded && row.plan === null,
          );
          if (failing.length > 0)
            throw new DomainError('INVALID_STATE', 'Some rows still have errors.', {
              fields: { rows: [`${failing.length} row(s) with errors`] },
            });
          const plans = checked.flatMap((row, index) =>
            row.plan ? [{ row: rows[index]!, plan: row.plan }] : [],
          );
          const written = plans.filter(({ plan }) => !plan.skip);

          // Substances: the existing one, or created here.
          const groups = new Map<string, typeof written>();
          for (const item of written) {
            const list = groups.get(item.plan.substanceKey) ?? [];
            list.push(item);
            groups.set(item.plan.substanceKey, list);
          }
          const toCreate = [...groups.values()].filter((group) => !group[0]!.plan.existing);
          const created = toCreate.length
            ? await tx.substance.createManyAndReturn({
                data: toCreate.map((group) => {
                  const nameFr = group[0]!.plan.substanceName.slice(0, 200);
                  return {
                    nameFr,
                    synonyms: [],
                    searchText: searchTextOf(nameFr, null, []),
                    createdById: admin.adminId,
                    updatedById: admin.adminId,
                  };
                }),
                select: { id: true, nameFr: true },
              })
            : [];
          const substanceIdByKey = new Map<string, string>();
          for (const substance of created)
            substanceIdByKey.set(normaliseForSearch(substance.nameFr), substance.id);
          for (const [key, group] of groups)
            if (group[0]!.plan.existing) substanceIdByKey.set(key, group[0]!.plan.existing.id);

          // Sources: reuse a registry entry with the same URL, otherwise add one.
          const urls = [
            ...new Set(written.flatMap(({ plan }) => (plan.source ? [plan.source.url] : []))),
          ];
          const known = urls.length
            ? await tx.clinicalSource.findMany({
                where: { url: { in: urls } },
                orderBy: { createdAt: 'asc' },
              })
            : [];
          const sourceIdByUrl = new Map<string, string>();
          for (const source of known)
            if (source.url && !sourceIdByUrl.has(source.url))
              sourceIdByUrl.set(source.url, source.id);
          const missing = urls.filter((url) => !sourceIdByUrl.has(url));
          const newSources = missing.length
            ? await tx.clinicalSource.createManyAndReturn({
                data: missing.map((url) => {
                  const plan = written.find(({ plan: p }) => p.source?.url === url)!.plan;
                  return {
                    title: (plan.source!.title ?? plan.source!.host).slice(0, 300),
                    type: 'REFERENCE' as const,
                    url,
                    createdById: admin.adminId,
                  };
                }),
                select: { id: true, url: true },
              })
            : [];
          for (const source of newSources) sourceIdByUrl.set(source.url!, source.id);

          // One draft per substance: my open draft, or a new version from the published one.
          const result: CommitResult = {
            substancesCreated: created.length,
            versionsCreated: 0,
            versionsUpdated: 0,
            sourcesCreated: newSources.length,
            rowsWritten: written.length,
            rowsSkipped: plans.length - written.length,
            versionIds: [],
          };
          const audits: AuditItem[] = [];
          for (const [key, group] of groups) {
            const substanceId = substanceIdByKey.get(key)!;
            const existing = group[0]!.plan.existing;
            let versionId: string;
            let content: ProfileContent;
            if (existing?.open && EDITABLE.includes(existing.open.status)) {
              versionId = existing.open.id;
              content = existing.open.content;
              result.versionsUpdated++;
            } else {
              const published = await tx.substanceProfileVersion.findFirst({
                where: { substanceId, status: 'PUBLISHED' },
                include: { sources: { select: { sourceId: true } } },
              });
              const last = await tx.substanceProfileVersion.aggregate({
                where: { substanceId },
                _max: { version: true },
              });
              const version = await tx.substanceProfileVersion.create({
                data: {
                  substanceId,
                  version: (last._max.version ?? 0) + 1,
                  content: json(published?.content ?? EMPTY_CONTENT),
                  changeReason: input.reason,
                  authoredById: admin.adminId,
                  sources: {
                    create: (published?.sources ?? []).map(({ sourceId }) => ({ sourceId })),
                  },
                },
              });
              versionId = version.id;
              content = profileContentSchema.parse(published?.content ?? EMPTY_CONTENT);
              result.versionsCreated++;
            }
            const next = profileContentSchema.parse(
              applyRows(
                content,
                group.map(({ plan }) => plan),
                {
                  sourceId: (url) => sourceIdByUrl.get(url)!,
                  substanceId: (alternative) => substanceIdByKey.get(alternative) ?? null,
                },
              ),
            );
            await tx.substanceProfileVersion.update({
              where: { id: versionId },
              data: { content: json(next) },
            });
            const used = [
              ...new Set(
                group.flatMap(({ plan }) =>
                  plan.source ? [sourceIdByUrl.get(plan.source.url)!] : [],
                ),
              ),
            ];
            if (used.length)
              await tx.profileVersionSource.createMany({
                data: used.map((sourceId) => ({ versionId, sourceId })),
                skipDuplicates: true,
              });
            await tx.pregnancyImportRow.updateMany({
              where: { id: { in: group.map(({ row }) => row.id) } },
              data: { substanceId, versionId },
            });
            result.versionIds.push(versionId);
            audits.push({
              action: existing?.open ? 'pregnancy.version.saved' : 'pregnancy.version.created',
              entityType: 'SubstanceProfileVersion',
              entityId: versionId,
              after: {
                substanceId,
                importBatchId: id,
                rows: group.map(({ row }) => row.rowNumber),
              },
            });
          }
          for (const substance of created)
            audits.push({
              action: 'pregnancy.substance.created',
              entityType: 'Substance',
              entityId: substance.id,
              after: { nameFr: substance.nameFr, importBatchId: id },
            });
          for (const source of newSources)
            audits.push({
              action: 'pregnancy.source.created',
              entityType: 'ClinicalSource',
              entityId: source.id,
              after: { url: source.url, importBatchId: id },
            });

          const counts = summarise(inputs, checked);
          await tx.pregnancyImportBatch.update({
            where: { id },
            data: {
              status: 'COMMITTED',
              committedById: admin.adminId,
              committedAt: new Date(),
              reason: input.reason,
              summary: json({ counts, result }),
            },
          });
          return { result, fresh: true, audits };
        },
        { timeout: 120_000, maxWait: 10_000 },
      )
      .catch(async (error: unknown) => {
        // Refused: store the issues found at commit time so the admin sees why.
        if (error instanceof DomainError && error.code === 'INVALID_STATE')
          await this.recheck(id, admin.adminId);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new DomainError(
            'VERSION_CONFLICT',
            'Another change to the same substance was saved meanwhile; check again.',
          );
        throw error;
      });

    if (outcome.fresh) {
      await this.record(admin, client, 'pregnancy.import.committed', id, {
        after: outcome.result,
        reason: input.reason,
      });
      for (const entry of outcome.audits) {
        await this.audit.record({
          actorType: 'ADMIN',
          actorId: admin.adminId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          after: entry.after as Prisma.InputJsonValue,
          reason: input.reason,
          ip: client.ip,
          userAgent: client.userAgent,
        });
      }
    }
    return outcome.result;
  }

  // ─────────────────────────────── internals ───────────────────────────────

  private async editable(id: string, revision: number) {
    const batch = await this.prisma.pregnancyImportBatch.findUnique({ where: { id } });
    if (!batch) throw new DomainError('NOT_FOUND', 'Import not found.');
    if (batch.status !== 'PREVIEW')
      throw new DomainError('INVALID_STATE', `This import is ${batch.status}.`);
    if (batch.revision !== revision)
      throw new DomainError('VERSION_CONFLICT', 'The import changed since you loaded it.', {
        fields: { revision: [String(batch.revision)] },
      });
    return batch;
  }

  private async bump(
    tx: Prisma.TransactionClient,
    id: string,
    revision: number,
    data: Prisma.PregnancyImportBatchUpdateInput,
  ) {
    const { count } = await tx.pregnancyImportBatch.updateMany({
      where: { id, revision, status: 'PREVIEW' },
      data: { ...data, revision: { increment: 1 } },
    });
    if (count !== 1)
      throw new DomainError('VERSION_CONFLICT', 'The import changed since you loaded it.');
  }

  /** Re-checks every row (duplicates depend on the others) and stores the issues that changed. */
  private async recheck(id: string, authorId: string): Promise<void> {
    const batch = await this.prisma.pregnancyImportBatch.findUniqueOrThrow({ where: { id } });
    const rows = await this.prisma.pregnancyImportRow.findMany({
      where: { batchId: id },
      orderBy: { rowNumber: 'asc' },
    });
    const checked = checkRows(
      rows.map(toInput),
      batch.statusMapping as StatusMapping,
      libraryOf(await loadLibrary(this.prisma)),
      authorId,
    );
    const changed = checked.filter(
      (row, index) => JSON.stringify(row.issues) !== JSON.stringify(rows[index]!.issues),
    );
    for (let i = 0; i < changed.length; i += 200) {
      await this.prisma.$transaction(
        changed.slice(i, i + 200).map((row) =>
          this.prisma.pregnancyImportRow.update({
            where: { id: row.id },
            data: { issues: json(row.issues) },
          }),
        ),
      );
    }
  }

  private async record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    batchId: string,
    detail: { before?: unknown; after?: unknown; reason?: string },
  ) {
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action,
      entityType: 'PregnancyImportBatch',
      entityId: batchId,
      before: detail.before as Prisma.InputJsonValue | undefined,
      after: detail.after as Prisma.InputJsonValue | undefined,
      reason: detail.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}

function toInput(row: {
  id: string;
  rowNumber: number;
  values: Prisma.JsonValue;
  original: Prisma.JsonValue;
  excluded: boolean;
  resolution: string | null;
}): RowInput {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    values: row.values as RowValues,
    original: row.original as unknown as Cell[],
    excluded: row.excluded,
    resolution: row.resolution === 'UPDATE' || row.resolution === 'SKIP' ? row.resolution : null,
  };
}

async function loadLibrary(
  db: Prisma.TransactionClient | PrismaService,
): Promise<LibrarySubstance[]> {
  // A merged duplicate is represented by the substance it was merged into (ADR-027).
  const substances = await db.substance.findMany({
    where: { mergedIntoId: null },
    select: {
      id: true,
      nameFr: true,
      nameEn: true,
      synonyms: true,
      versions: {
        where: { status: { in: [...OPEN, 'PUBLISHED'] } },
        select: { id: true, status: true, authoredById: true, content: true },
      },
    },
  });
  return substances.map((substance) => {
    const open = substance.versions.find((version) =>
      (OPEN as readonly string[]).includes(version.status),
    );
    const published = substance.versions.find((version) => version.status === 'PUBLISHED');
    return {
      id: substance.id,
      nameFr: substance.nameFr,
      names: [substance.nameFr, substance.nameEn ?? '', ...substance.synonyms],
      open: open
        ? {
            id: open.id,
            status: open.status,
            authoredById: open.authoredById,
            content: profileContentSchema.parse(open.content),
          }
        : null,
      published: published ? profileContentSchema.parse(published.content) : null,
    };
  });
}

export type { Library };
