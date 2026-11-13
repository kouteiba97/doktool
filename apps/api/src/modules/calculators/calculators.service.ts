import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { compareFrench, matchesAllWords } from '../../common/text/search-text.js';
import type {
  AccessTier,
  CalculatorSourceRole,
  CalculatorTestOutcome,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { AccessService, type ItemAccess } from '../access/index.js';
import {
  type CalculatorDefinition,
  checkDefinition,
  type Evaluation,
  type EvaluationInputs,
  evaluate,
} from './engine/index.js';

/** A calculator in the app's lists, with the viewer's access. */
export interface CalculatorSummary {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  purposeFr: string | null;
  purposeEn: string | null;
  category: string | null;
  version: number;
  access: ItemAccess;
}

/** A source shown under a calculator. */
export interface PublishedSource {
  role: CalculatorSourceRole;
  authors: string;
  title: string;
  publisher: string;
  year: number;
  doi: string | null;
  url: string | null;
  edition: string | null;
  formulaLocation: string;
}

/** The published version the app runs: definition, checksum, review and sources. */
export interface PublishedVersion {
  versionId: string;
  version: number;
  definition: CalculatorDefinition;
  definitionSha256: string;
  engineVersion: string;
  publishedAt: Date;
  review: { reviewedBy: string; reviewedAt: Date; testsPassed: number };
  sources: PublishedSource[];
}

/** A test case sent to the app so its offline engine can check itself. */
export interface PublishedTestCase {
  inputs: EvaluationInputs;
  expectedOutcome: CalculatorTestOutcome;
  expectedValue: number | null;
  tolerance: number | null;
  expectedBand: string | null;
}

/** Relations loaded with a calculator's published version. */
const PUBLISHED_INCLUDE = {
  currentVersion: {
    include: {
      sources: { orderBy: { createdAt: 'asc' as const } },
      testCases: { orderBy: { createdAt: 'asc' as const } },
      reviewedBy: { select: { fullName: true } },
    },
  },
} as const;

/** What a list needs of a calculator: its names, access facts and current version number. */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  nameFr: true,
  nameEn: true,
  purposeFr: true,
  purposeEn: true,
  category: true,
  accessTier: true,
  demoSample: true,
  currentVersion: { select: { version: true } },
} as const;

/** A calculator row as lists read it. */
type SummaryRow = Omit<Row, 'currentVersion'> & { currentVersion: { version: number } | null };

/** A calculator row with its published version, as read here. */
type Row = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  purposeFr: string | null;
  purposeEn: string | null;
  category: string | null;
  accessTier: AccessTier;
  demoSample: boolean;
  currentVersion: {
    id: string;
    version: number;
    definition: unknown;
    definitionSha256: string;
    engineVersion: string | null;
    publishedAt: Date | null;
    reviewedAt: Date | null;
    testRun: unknown;
    reviewedBy: { fullName: string } | null;
    sources: (PublishedSource & { id: string })[];
    testCases: (PublishedTestCase & { id: string; inputs: unknown })[];
  } | null;
};

/**
 * What users see of the calculators (section 28): active calculators with a published version,
 * each with the server's access decision. The definition, sources and review are returned only
 * when the viewer may use the calculator. Inputs are evaluated, never stored.
 */
@Injectable()
export class CalculatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Names of calculators by id (admin read models). */
  async labels(
    ids: string[],
  ): Promise<Map<string, { nameFr: string; nameEn: string; slug: string }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.calculator.findMany({
      where: { id: { in: unique } },
      select: { id: true, nameFr: true, nameEn: true, slug: true },
    });
    return new Map(rows.map(({ id, ...label }) => [id, label]));
  }

  /** Versions submitted for review, oldest first. */
  async awaitingReview(limit: number) {
    return this.prisma.calculatorVersion.findMany({
      where: { status: 'IN_REVIEW' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        version: true,
        createdAt: true,
        calculator: { select: { id: true, nameFr: true, nameEn: true } },
      },
    });
  }

  /**
   * Active calculators with a published version, optionally filtered by words, A–Z, each with its
   * lock.
   */
  async list(viewer: Viewer, query?: string): Promise<CalculatorSummary[]> {
    const rows = await this.summaryRows();
    const matching = query
      ? rows.filter((row) => matchesAllWords(query, [row.nameFr, row.nameEn]))
      : rows;
    return (await this.withAccess(viewer, matching))
      .map(({ summary }) => summary)
      .sort((a, b) => compareFrench(a.nameFr, b.nameFr));
  }

  /** One calculator by slug; its definition and tests are sent only when the viewer may use it. */
  async get(
    viewer: Viewer,
    slug: string,
  ): Promise<{
    summary: CalculatorSummary;
    published: PublishedVersion | null;
    testCases: PublishedTestCase[];
  }> {
    const row = await this.prisma.calculator.findUnique({
      where: { slug },
      include: PUBLISHED_INCLUDE,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Calculator not found.');
    if (row.status !== 'ACTIVE' || !row.currentVersion) {
      throw new DomainError('CONTENT_UNAVAILABLE', 'This calculator is no longer available.', {
        lockReason: 'NO_LONGER_AVAILABLE',
        unlockPath: null,
      });
    }
    const [entry] = await this.withAccess(viewer, [row as Row]);
    const { summary } = entry!;
    const available = summary.access.state === 'AVAILABLE';
    return {
      summary,
      published: available ? published(row as Row) : null,
      testCases: available ? testCasesOf(row as Row) : [],
    };
  }

  /** Online evaluation with the authoritative engine, on the current published version only. */
  async evaluate(
    viewer: Viewer,
    slug: string,
    version: number,
    inputs: EvaluationInputs,
  ): Promise<{ evaluation: Evaluation; versionId: string; definitionSha256: string }> {
    const { summary, published: current } = await this.get(viewer, slug);
    if (summary.access.state === 'LOCKED' || !current) {
      throw new DomainError('FEATURE_LOCKED', 'This calculator is locked for this account.', {
        lockReason: summary.access.lockReason ?? undefined,
        unlockPath: summary.access.unlockPath,
      });
    }
    if (current.version !== version) {
      throw new DomainError(
        'CONTENT_UNAVAILABLE',
        `Version ${version} is no longer published; update to v${current.version}.`,
      );
    }
    return {
      evaluation: evaluate(current.definition, inputs),
      versionId: current.versionId,
      definitionSha256: current.definitionSha256,
    };
  }

  /** Every calculator the viewer may use, with its test cases for the device self-test (offline manifest). */
  async openable(
    viewer: Viewer,
  ): Promise<
    (CalculatorSummary & { published: PublishedVersion; testCases: PublishedTestCase[] })[]
  > {
    const entries = await this.withAccess(viewer, await this.rows());
    return entries
      .filter(({ summary }) => summary.access.state === 'AVAILABLE')
      .map(({ summary, row }) => ({
        ...summary,
        published: published(row),
        testCases: testCasesOf(row),
      }))
      .sort((a, b) => compareFrench(a.nameFr, b.nameFr));
  }

  /** The published calculators among `ids` (favorites), with access; others are left out. */
  async summariesByIds(viewer: Viewer, ids: readonly string[]): Promise<CalculatorSummary[]> {
    if (ids.length === 0) return [];
    const entries = await this.withAccess(viewer, await this.summaryRows([...ids]));
    return entries.map(({ summary }) => summary);
  }

  /** Active calculators with a published version (only what a list shows), optionally by id. */
  private async summaryRows(ids?: string[]): Promise<SummaryRow[]> {
    return this.prisma.calculator.findMany({
      where: {
        status: 'ACTIVE',
        currentVersionId: { not: null },
        ...(ids ? { id: { in: ids } } : {}),
      },
      select: SUMMARY_SELECT,
    });
  }

  /** Every active calculator with a published version. */
  private async rows(): Promise<Row[]> {
    const rows = await this.prisma.calculator.findMany({
      where: { status: 'ACTIVE', currentVersionId: { not: null } },
      include: PUBLISHED_INCLUDE,
    });
    return rows as Row[];
  }

  /** Adds the viewer's access decision to each calculator. */
  private async withAccess<R extends SummaryRow>(
    viewer: Viewer,
    rows: R[],
  ): Promise<{ summary: CalculatorSummary; row: R }[]> {
    const { decisions } = await this.access.decideItems(
      viewer,
      rows.map((row) => ({
        type: 'calculators' as const,
        accessTier: row.accessTier,
        demoSample: row.demoSample,
      })),
    );
    return rows.map((row, index) => ({
      row,
      summary: {
        id: row.id,
        slug: row.slug,
        nameFr: row.nameFr,
        nameEn: row.nameEn,
        purposeFr: row.purposeFr,
        purposeEn: row.purposeEn,
        category: row.category,
        version: row.currentVersion!.version,
        access: decisions[index]!,
      },
    }));
  }
}

/** The published version's test cases in the app's shape. */
function testCasesOf(row: Row): PublishedTestCase[] {
  return row.currentVersion!.testCases.map((testCase) => ({
    inputs: testCase.inputs,
    expectedOutcome: testCase.expectedOutcome,
    expectedValue: testCase.expectedValue,
    tolerance: testCase.tolerance,
    expectedBand: testCase.expectedBand,
  }));
}

/** The published version in the app's shape (its definition is checked again). */
function published(row: Row): PublishedVersion {
  const version = row.currentVersion!;
  const checked = checkDefinition(version.definition);
  if (!checked.ok)
    throw new Error(`Published definition of ${row.slug} v${version.version} is invalid`);
  const run = version.testRun as { total?: number } | null;
  return {
    versionId: version.id,
    version: version.version,
    definition: checked.definition,
    definitionSha256: version.definitionSha256,
    engineVersion: version.engineVersion!,
    publishedAt: version.publishedAt!,
    review: {
      reviewedBy: version.reviewedBy!.fullName,
      reviewedAt: version.reviewedAt!,
      testsPassed: run?.total ?? version.testCases.length,
    },
    sources: version.sources.map((source) => ({
      role: source.role,
      authors: source.authors,
      title: source.title,
      publisher: source.publisher,
      year: source.year,
      doi: source.doi,
      url: source.url,
      edition: source.edition,
      formulaLocation: source.formulaLocation,
    })),
  };
}
