import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import {
  type AccessTier,
  type CalculatorSourceRole,
  type CalculatorTestOutcome,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { DRAFTING_ACTIONS } from './calculators.policy.js';
import {
  type CalculatorDefinition,
  checkDefinition,
  definitionSha256,
  ENGINE_VERSION,
  type Evaluation,
  type EvaluationInputs,
  evaluate,
  runTestCases,
  type TestRun,
} from './engine/index.js';

export interface NewCalculator {
  slug: string;
  nameFr: string;
  nameEn: string;
  purposeFr?: string | null;
  purposeEn?: string | null;
  category?: string | null;
  accessTier: AccessTier;
  demoSample: boolean;
  reason: string;
}

export interface CalculatorPatch {
  nameFr?: string;
  nameEn?: string;
  purposeFr?: string | null;
  purposeEn?: string | null;
  category?: string | null;
  accessTier?: AccessTier;
  demoSample?: boolean;
  reason: string;
}

export interface NewSource {
  role: CalculatorSourceRole;
  authors: string;
  title: string;
  publisher: string;
  year: number;
  doi?: string | null;
  url?: string | null;
  edition?: string | null;
  formulaLocation: string;
  accessedAt: Date;
}

export interface NewTestCase {
  inputs: EvaluationInputs;
  expectedOutcome: CalculatorTestOutcome;
  expectedValue?: number | null;
  tolerance?: number | null;
  expectedBand?: string | null;
  origin: string;
}

/** A stored test run also records which definition it ran against. */
type StoredTestRun = TestRun & { definitionSha256: string };

const VERSION_INCLUDE = {
  sources: { orderBy: { createdAt: 'asc' } },
  testCases: { orderBy: { createdAt: 'asc' } },
  authoredBy: { select: { id: true, fullName: true } },
  reviewedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.CalculatorVersionInclude;

export type VersionRecord = Prisma.CalculatorVersionGetPayload<{ include: typeof VERSION_INCLUDE }>;
export type CalculatorRecord = Prisma.CalculatorGetPayload<object> & { versions: VersionRecord[] };

/**
 * Calculator governance for Admin Web (section 28, ADR-012 §6). No formula is written here: the
 * definition is data authored from a cited source; this service enforces the review workflow.
 */
@Injectable()
export class CalculatorsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── calculators ───────────────────────────

  async list(): Promise<CalculatorRecord[]> {
    const calculators = await this.prisma.calculator.findMany({ orderBy: { nameFr: 'asc' } });
    return Promise.all(
      calculators.map(async (calculator) => ({
        ...calculator,
        versions: await this.versionsOf(calculator.id),
      })),
    );
  }

  async detail(calculatorId: string): Promise<CalculatorRecord> {
    const calculator = await this.prisma.calculator.findUnique({ where: { id: calculatorId } });
    if (!calculator) throw new DomainError('NOT_FOUND', 'Calculator not found.');
    return { ...calculator, versions: await this.versionsOf(calculatorId) };
  }

  async createCalculator(
    admin: AdminPrincipal,
    input: NewCalculator,
    client: ClientInfo,
  ): Promise<CalculatorRecord> {
    try {
      const calculator = await this.prisma.calculator.create({
        data: {
          slug: input.slug,
          nameFr: input.nameFr.trim(),
          nameEn: input.nameEn.trim(),
          purposeFr: input.purposeFr?.trim() || null,
          purposeEn: input.purposeEn?.trim() || null,
          category: input.category?.trim() || null,
          accessTier: input.accessTier,
          demoSample: input.demoSample,
        },
      });
      await this.record(admin, client, 'calculator.created', 'Calculator', calculator.id, {
        after: {
          slug: calculator.slug,
          nameFr: calculator.nameFr,
          accessTier: calculator.accessTier,
          demoSample: calculator.demoSample,
        },
        reason: input.reason,
      });
      return { ...calculator, versions: [] };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('VERSION_CONFLICT', 'A calculator already uses this slug.');
      }
      throw error;
    }
  }

  /** Names and category need `calculators.draft`; access tier and demo sample change who can use it. */
  async updateCalculator(
    admin: AdminPrincipal,
    calculatorId: string,
    patch: CalculatorPatch,
    client: ClientInfo,
  ): Promise<CalculatorRecord> {
    const touchesAccess = patch.accessTier !== undefined || patch.demoSample !== undefined;
    if (touchesAccess && !admin.grants.includes('calculators.publish')) {
      throw new DomainError('FORBIDDEN', 'Changing access needs the calculators.publish grant.');
    }
    const before = await this.detail(calculatorId);
    await this.prisma.calculator.update({
      where: { id: calculatorId },
      data: {
        ...(patch.nameFr !== undefined ? { nameFr: patch.nameFr.trim() } : {}),
        ...(patch.nameEn !== undefined ? { nameEn: patch.nameEn.trim() } : {}),
        ...(patch.purposeFr !== undefined ? { purposeFr: patch.purposeFr?.trim() || null } : {}),
        ...(patch.purposeEn !== undefined ? { purposeEn: patch.purposeEn?.trim() || null } : {}),
        ...(patch.category !== undefined ? { category: patch.category?.trim() || null } : {}),
        ...(patch.accessTier !== undefined ? { accessTier: patch.accessTier } : {}),
        ...(patch.demoSample !== undefined ? { demoSample: patch.demoSample } : {}),
      },
    });
    const after = await this.detail(calculatorId);
    const snapshot = (c: CalculatorRecord) => ({
      nameFr: c.nameFr,
      nameEn: c.nameEn,
      purposeFr: c.purposeFr,
      purposeEn: c.purposeEn,
      category: c.category,
      accessTier: c.accessTier,
      demoSample: c.demoSample,
    });
    await this.record(admin, client, 'calculator.updated', 'Calculator', calculatorId, {
      before: snapshot(before),
      after: snapshot(after),
      reason: patch.reason,
    });
    return after;
  }

  // ─────────────────────────── drafting ───────────────────────────

  /** « Nouvelle version »: from a definition, or copying an earlier version with its sources and tests. */
  async createVersion(
    admin: AdminPrincipal,
    calculatorId: string,
    input: { definition?: unknown; copyFromVersion?: number },
    client: ClientInfo,
  ): Promise<VersionRecord> {
    const calculator = await this.detail(calculatorId);
    if (calculator.versions.some((v) => v.status === 'DRAFT' || v.status === 'IN_REVIEW')) {
      throw new DomainError('INVALID_STATE', 'Finish or discard the open draft first.');
    }
    const source =
      input.copyFromVersion !== undefined
        ? calculator.versions.find((v) => v.version === input.copyFromVersion)
        : undefined;
    if (input.copyFromVersion !== undefined && !source)
      throw new DomainError('NOT_FOUND', 'Version to copy not found.');
    const definition = this.requireValid(source ? source.definition : input.definition);
    const number = (calculator.versions[0]?.version ?? 0) + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.calculatorVersion.create({
        data: {
          calculatorId,
          version: number,
          definition: definition,
          definitionSha256: definitionSha256(definition),
          authoredById: admin.adminId,
        },
      });
      if (source) {
        await tx.calculatorSource.createMany({
          data: source.sources.map(
            ({ id: _id, createdAt: _at, calculatorVersionId: _v, ...rest }) => ({
              ...rest,
              calculatorVersionId: version.id,
            }),
          ),
        });
        await tx.calculatorTestCase.createMany({
          data: source.testCases.map(
            ({ id: _id, createdAt: _at, calculatorVersionId: _v, inputs, ...rest }) => ({
              ...rest,
              inputs: inputs as Prisma.InputJsonValue,
              calculatorVersionId: version.id,
            }),
          ),
        });
      }
      return version;
    });
    await this.record(
      admin,
      client,
      'calculator.version.created',
      'CalculatorVersion',
      created.id,
      {
        after: {
          calculatorId,
          version: number,
          copiedFrom: input.copyFromVersion ?? null,
          definitionSha256: created.definitionSha256,
        },
      },
    );
    return this.version(created.id);
  }

  async saveDefinition(
    admin: AdminPrincipal,
    versionId: string,
    raw: unknown,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    const version = await this.requireStatus(versionId, ['DRAFT']);
    const definition = this.requireValid(raw);
    const sha = definitionSha256(definition);
    await this.prisma.calculatorVersion.update({
      where: { id: versionId },
      data: {
        definition: definition,
        definitionSha256: sha,
        testRun: Prisma.DbNull,
      },
    });
    await this.record(
      admin,
      client,
      'calculator.version.definition_saved',
      'CalculatorVersion',
      versionId,
      {
        before: { definitionSha256: version.definitionSha256 },
        after: { definitionSha256: sha },
      },
    );
    return this.version(versionId);
  }

  async addSource(
    admin: AdminPrincipal,
    versionId: string,
    input: NewSource,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    await this.requireStatus(versionId, ['DRAFT']);
    const source = await this.prisma.calculatorSource.create({
      data: { ...input, calculatorVersionId: versionId },
    });
    await this.record(
      admin,
      client,
      'calculator.version.source_added',
      'CalculatorVersion',
      versionId,
      {
        after: { sourceId: source.id, role: source.role, title: source.title, year: source.year },
      },
    );
    return this.version(versionId);
  }

  async removeSource(
    admin: AdminPrincipal,
    versionId: string,
    sourceId: string,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    await this.requireStatus(versionId, ['DRAFT']);
    const { count } = await this.prisma.calculatorSource.deleteMany({
      where: { id: sourceId, calculatorVersionId: versionId },
    });
    if (count === 0) throw new DomainError('NOT_FOUND', 'Source not found.');
    await this.record(
      admin,
      client,
      'calculator.version.source_removed',
      'CalculatorVersion',
      versionId,
      { after: { sourceId } },
    );
    return this.version(versionId);
  }

  async addTestCase(
    admin: AdminPrincipal,
    versionId: string,
    input: NewTestCase,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    await this.requireStatus(versionId, ['DRAFT']);
    if (
      input.expectedOutcome === 'RESULT' &&
      (input.expectedValue == null || input.tolerance == null)
    ) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'A RESULT case needs an expected value and a tolerance.',
        {
          fields: { expectedValue: ['required for RESULT'], tolerance: ['required for RESULT'] },
        },
      );
    }
    const testCase = await this.prisma.$transaction(async (tx) => {
      const created = await tx.calculatorTestCase.create({
        data: {
          calculatorVersionId: versionId,
          inputs: input.inputs,
          expectedOutcome: input.expectedOutcome,
          expectedValue: input.expectedOutcome === 'RESULT' ? input.expectedValue : null,
          tolerance: input.expectedOutcome === 'RESULT' ? input.tolerance : null,
          expectedBand: input.expectedBand ?? null,
          origin: input.origin.trim(),
        },
      });
      await tx.calculatorVersion.update({
        where: { id: versionId },
        data: { testRun: Prisma.DbNull },
      });
      return created;
    });
    await this.record(
      admin,
      client,
      'calculator.version.test_case_added',
      'CalculatorVersion',
      versionId,
      {
        after: {
          testCaseId: testCase.id,
          expectedOutcome: testCase.expectedOutcome,
          origin: testCase.origin,
        },
      },
    );
    return this.version(versionId);
  }

  async removeTestCase(
    admin: AdminPrincipal,
    versionId: string,
    testCaseId: string,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    await this.requireStatus(versionId, ['DRAFT']);
    const count = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.calculatorTestCase.deleteMany({
        where: { id: testCaseId, calculatorVersionId: versionId },
      });
      await tx.calculatorVersion.update({
        where: { id: versionId },
        data: { testRun: Prisma.DbNull },
      });
      return deleted.count;
    });
    if (count === 0) throw new DomainError('NOT_FOUND', 'Test case not found.');
    await this.record(
      admin,
      client,
      'calculator.version.test_case_removed',
      'CalculatorVersion',
      versionId,
      { after: { testCaseId } },
    );
    return this.version(versionId);
  }

  /** « Lancer les tests » on the authoritative engine; the run is stored with the definition checksum. */
  async runTests(
    admin: AdminPrincipal,
    versionId: string,
    client: ClientInfo,
  ): Promise<{ version: VersionRecord; run: TestRun }> {
    const version = await this.requireStatus(versionId, ['DRAFT', 'IN_REVIEW']);
    const run = this.testRunFor(version);
    await this.prisma.calculatorVersion.update({
      where: { id: versionId },
      data: { testRun: run as unknown as Prisma.InputJsonValue },
    });
    await this.record(
      admin,
      client,
      'calculator.version.tests_run',
      'CalculatorVersion',
      versionId,
      {
        after: {
          passed: run.passed,
          total: run.total,
          failed: run.failed,
          engineVersion: run.engineVersion,
        },
      },
    );
    return { version: await this.version(versionId), run };
  }

  /** « Soumettre à revue »: needs a passing run of the current definition and a primary source. */
  async submit(
    admin: AdminPrincipal,
    versionId: string,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    const version = await this.requireStatus(versionId, ['DRAFT']);
    this.assertPublishable(version, this.storedRun(version));
    await this.prisma.calculatorVersion.update({
      where: { id: versionId },
      data: { status: 'IN_REVIEW' },
    });
    await this.record(
      admin,
      client,
      'calculator.version.submitted',
      'CalculatorVersion',
      versionId,
      {
        after: { status: 'IN_REVIEW' },
      },
    );
    return this.version(versionId);
  }

  /** « Renvoyer à l'auteur ». */
  async returnToDraft(
    admin: AdminPrincipal,
    versionId: string,
    reason: string,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    await this.requireStatus(versionId, ['IN_REVIEW']);
    await this.assertIndependentReviewer(admin, versionId);
    await this.prisma.calculatorVersion.update({
      where: { id: versionId },
      data: { status: 'DRAFT' },
    });
    await this.record(
      admin,
      client,
      'calculator.version.returned',
      'CalculatorVersion',
      versionId,
      {
        after: { status: 'DRAFT' },
        reason,
      },
    );
    return this.version(versionId);
  }

  /**
   * « Approuver et publier »: re-runs every test on the backend engine, checks sources and the
   * four-eyes rule, publishes, makes it current and retires the previously published version.
   */
  async publish(
    admin: AdminPrincipal,
    versionId: string,
    reviewNote: string,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    const version = await this.requireStatus(versionId, ['IN_REVIEW']);
    await this.assertIndependentReviewer(admin, versionId);
    const run = this.testRunFor(version);
    this.assertPublishable(version, run);

    const now = new Date();
    const previous = await this.prisma.$transaction(async (tx) => {
      const calculator = await tx.calculator.findUniqueOrThrow({
        where: { id: version.calculatorId },
      });
      await tx.calculatorVersion.update({
        where: { id: versionId },
        data: {
          status: 'PUBLISHED',
          reviewedById: admin.adminId,
          reviewedAt: now,
          reviewNote: reviewNote.trim(),
          publishedAt: now,
          engineVersion: ENGINE_VERSION,
          testRun: run as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.calculator.update({
        where: { id: calculator.id },
        data: { currentVersionId: versionId },
      });
      if (calculator.currentVersionId && calculator.currentVersionId !== versionId) {
        await tx.calculatorVersion.update({
          where: { id: calculator.currentVersionId },
          data: { status: 'RETIRED' },
        });
      }
      return calculator.currentVersionId;
    });
    await this.record(
      admin,
      client,
      'calculator.version.published',
      'CalculatorVersion',
      versionId,
      {
        after: {
          version: version.version,
          definitionSha256: version.definitionSha256,
          engineVersion: ENGINE_VERSION,
          testsPassed: run.total,
          retiredVersionId: previous,
        },
        reason: reviewNote,
      },
    );
    return this.version(versionId);
  }

  /** « Retirer »: devices drop it at the next sync; a retired current version leaves the calculator unavailable. */
  async retire(
    admin: AdminPrincipal,
    versionId: string,
    reason: string,
    client: ClientInfo,
  ): Promise<VersionRecord> {
    const version = await this.requireStatus(versionId, ['PUBLISHED']);
    await this.prisma.$transaction(async (tx) => {
      await tx.calculator.updateMany({
        where: { id: version.calculatorId, currentVersionId: versionId },
        data: { currentVersionId: null },
      });
      await tx.calculatorVersion.update({ where: { id: versionId }, data: { status: 'RETIRED' } });
    });
    await this.record(admin, client, 'calculator.version.retired', 'CalculatorVersion', versionId, {
      before: { status: 'PUBLISHED' },
      after: { status: 'RETIRED' },
      reason,
    });
    return this.version(versionId);
  }

  /** Deletes an unpublished draft together with its sources and tests. */
  async discard(admin: AdminPrincipal, versionId: string, client: ClientInfo): Promise<void> {
    const version = await this.requireStatus(versionId, ['DRAFT']);
    await this.prisma.$transaction(async (tx) => {
      await tx.calculatorSource.deleteMany({ where: { calculatorVersionId: versionId } });
      await tx.calculatorTestCase.deleteMany({ where: { calculatorVersionId: versionId } });
      await tx.calculatorVersion.delete({ where: { id: versionId } });
    });
    await this.record(
      admin,
      client,
      'calculator.version.discarded',
      'CalculatorVersion',
      versionId,
      {
        before: {
          calculatorId: version.calculatorId,
          version: version.version,
          definitionSha256: version.definitionSha256,
        },
      },
    );
  }

  /** « Aperçu »: any version, on the backend engine. Inputs are not stored. */
  async preview(versionId: string, inputs: EvaluationInputs): Promise<Evaluation> {
    return evaluate(this.definitionOf(await this.version(versionId)), inputs);
  }

  async version(versionId: string): Promise<VersionRecord> {
    const version = await this.prisma.calculatorVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE,
    });
    if (!version) throw new DomainError('NOT_FOUND', 'Calculator version not found.');
    return version;
  }

  // ─────────────────────────── rules ───────────────────────────

  private versionsOf(calculatorId: string): Promise<VersionRecord[]> {
    return this.prisma.calculatorVersion.findMany({
      where: { calculatorId },
      orderBy: { version: 'desc' },
      include: VERSION_INCLUDE,
    });
  }

  private async requireStatus(
    versionId: string,
    statuses: VersionRecord['status'][],
  ): Promise<VersionRecord> {
    const version = await this.version(versionId);
    if (!statuses.includes(version.status)) {
      throw new DomainError(
        'INVALID_STATE',
        `This action needs a version in ${statuses.join(' or ')}; it is ${version.status}.`,
      );
    }
    return version;
  }

  private requireValid(raw: unknown): CalculatorDefinition {
    const checked = checkDefinition(raw);
    if (!checked.ok) {
      const fields: Record<string, string[]> = {};
      for (const problem of checked.problems) (fields[problem.path] ??= []).push(problem.message);
      throw new DomainError('VALIDATION_FAILED', 'The definition is not valid.', { fields });
    }
    return checked.definition;
  }

  private definitionOf(version: VersionRecord): CalculatorDefinition {
    return this.requireValid(version.definition);
  }

  private testRunFor(version: VersionRecord): StoredTestRun {
    const run = runTestCases(
      this.definitionOf(version),
      version.testCases.map((testCase) => ({
        id: testCase.id,
        inputs: testCase.inputs as EvaluationInputs,
        expectedOutcome: testCase.expectedOutcome,
        expectedValue: testCase.expectedValue,
        tolerance: testCase.tolerance,
        expectedBand: testCase.expectedBand,
      })),
    );
    return { ...run, definitionSha256: version.definitionSha256 };
  }

  private storedRun(version: VersionRecord): StoredTestRun | null {
    const run = version.testRun as unknown as StoredTestRun | null;
    return run && run.definitionSha256 === version.definitionSha256 ? run : null;
  }

  /** The publication gate of section 28 (the database enforces it again). */
  private assertPublishable(version: VersionRecord, run: StoredTestRun | null): void {
    const problems: string[] = [];
    if (!version.sources.some((source) => source.role === 'PRIMARY'))
      problems.push('a PRIMARY source is required');
    const converts = this.definitionOf(version).inputs.some(
      (input) => (input.kind === 'NUMBER' || input.kind === 'INTEGER') && input.units.length > 0,
    );
    if (converts && !version.sources.some((source) => source.role === 'UNIT_CONVERSION')) {
      problems.push('the definition converts units: a UNIT_CONVERSION source is required');
    }
    if (version.testCases.length === 0) problems.push('at least one test case is required');
    if (!run) problems.push('run the tests on the current definition first');
    else if (!run.passed) problems.push(`${run.failed} of ${run.total} test case(s) fail`);
    if (problems.length > 0) {
      throw new DomainError('INVALID_STATE', `Not publishable: ${problems.join('; ')}.`, {
        fields: { version: problems },
      });
    }
  }

  /** Four-eyes: the reviewer is neither the author nor anyone who changed the draft. */
  private async assertIndependentReviewer(admin: AdminPrincipal, versionId: string): Promise<void> {
    const version = await this.version(versionId);
    const contributed =
      version.authoredById === admin.adminId ||
      (await this.prisma.auditLogEntry.count({
        where: {
          entityType: 'CalculatorVersion',
          entityId: versionId,
          actorType: 'ADMIN',
          actorId: admin.adminId,
          action: { in: [...DRAFTING_ACTIONS] },
        },
      })) > 0;
    if (contributed) {
      throw new DomainError(
        'FORBIDDEN',
        'The reviewer must not have authored or edited this version.',
      );
    }
  }

  private record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    entityType: 'Calculator' | 'CalculatorVersion',
    entityId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue; reason?: string },
  ): Promise<void> {
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
