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

export interface PublishedTestCase {
  inputs: EvaluationInputs;
  expectedOutcome: CalculatorTestOutcome;
  expectedValue: number | null;
  tolerance: number | null;
  expectedBand: string | null;
}

const PUBLISHED_INCLUDE = {
  currentVersion: {
    include: {
      sources: { orderBy: { createdAt: 'asc' as const } },
      testCases: { orderBy: { createdAt: 'asc' as const } },
      reviewedBy: { select: { fullName: true } },
    },
  },
} as const;

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

  async list(viewer: Viewer, query?: string): Promise<CalculatorSummary[]> {
    const rows = await this.rows();
    const matching = query
      ? rows.filter((row) => matchesAllWords(query, [row.nameFr, row.nameEn]))
      : rows;
    return (await this.withAccess(viewer, matching))
      .map(({ summary }) => summary)
      .sort((a, b) => compareFrench(a.nameFr, b.nameFr));
  }

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

  private async rows(): Promise<Row[]> {
    const rows = await this.prisma.calculator.findMany({
      where: { status: 'ACTIVE', currentVersionId: { not: null } },
      include: PUBLISHED_INCLUDE,
    });
    return rows as Row[];
  }

  private async withAccess(
    viewer: Viewer,
    rows: Row[],
  ): Promise<{ summary: CalculatorSummary; row: Row }[]> {
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

function testCasesOf(row: Row): PublishedTestCase[] {
  return row.currentVersion!.testCases.map((testCase) => ({
    inputs: testCase.inputs,
    expectedOutcome: testCase.expectedOutcome,
    expectedValue: testCase.expectedValue,
    tolerance: testCase.tolerance,
    expectedBand: testCase.expectedBand,
  }));
}

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
