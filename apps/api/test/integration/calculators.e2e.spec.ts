// Phase 7 exit criterion: a published calculator cannot exist without a source, passing tests and
// a distinct reviewer. The fixture is deliberately non-clinical (a rectangle area): real
// calculators are data entered from a cited source by an admin (ADR-012).
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AdminActor, adminActor, demoActor, userActor } from './actors.js';
import { useTestApp } from './app.js';

const app = useTestApp();
let editor: AdminActor;
let reviewer: AdminActor;
let superAdmin: AdminActor;

beforeAll(async () => {
  editor = await adminActor(app, 'CALCULATOR_EDITOR');
  reviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  superAdmin = await adminActor(app, 'SUPER_ADMIN');
});

const t = (fr: string, en: string) => ({ fr, en });
const side = (key: string) => ({
  kind: 'NUMBER',
  key,
  label: t(`Côté ${key}`, `Side ${key}`),
  required: true,
  quantity: 'LENGTH',
  canonicalUnit: 'm',
  units: [{ code: 'cm', factorToCanonical: 0.01, source: 'Test fixture, SI prefixes' }],
  decimals: 2,
  hardRange: { min: 0 },
  validatedRange: { min: 0.1, max: 100 },
});
const definition = (formulaFactor = 1) => ({
  schemaVersion: 1,
  inputs: [side('length'), side('width')],
  formula: {
    op: 'mul',
    args: [{ op: 'mul', args: [{ input: 'length' }, { input: 'width' }] }, { num: formulaFactor }],
  },
  result: { unit: 'm²', decimals: 2, label: t('Surface', 'Area') },
  limitations: t('Fixture de test, non clinique.', 'Test fixture, not clinical.'),
});
const source = (role: 'PRIMARY' | 'UNIT_CONVERSION') => ({
  role,
  authors: 'Test Author',
  title: `Test source (${role})`,
  publisher: 'Test Publisher',
  year: 2024,
  formulaLocation: 'p. 1',
  accessedAt: '2026-09-20',
});
const cases = {
  result: {
    inputs: { length: { value: 200, unit: 'cm' }, width: { value: 3 } },
    expectedOutcome: 'RESULT',
    expectedValue: 6,
    tolerance: 1e-9,
    origin: 'Worked example',
  },
  outOfRange: {
    inputs: { length: { value: 500 }, width: { value: 1 } },
    expectedOutcome: 'OUT_OF_VALIDATED_RANGE',
    origin: 'Validated range edge',
  },
  wrong: {
    inputs: { length: { value: 2 }, width: { value: 3 } },
    expectedOutcome: 'RESULT',
    expectedValue: 7,
    tolerance: 0.01,
    origin: 'Deliberately wrong',
  },
};

async function draftedVersion(
  accessTier: 'STUDENT' | 'PROFESSIONAL' = 'STUDENT',
  demoSample = false,
) {
  const slug = `rectangle-${randomUUID().slice(0, 8)}`;
  const calculator = await editor
    .post('/admin/v1/calculators')
    .send({
      slug,
      nameFr: `Rectangle ${slug}`,
      nameEn: `Rectangle ${slug}`,
      accessTier,
      demoSample,
      reason: 'New tool',
    })
    .expect(200);
  const version = await editor
    .post(`/admin/v1/calculators/${calculator.body.id}/versions`)
    .send({ definition: definition() })
    .expect(200);
  return { slug, calculatorId: calculator.body.id as string, versionId: version.body.id as string };
}

async function readyForReview(versionId: string) {
  await editor
    .post(`/admin/v1/calculators/versions/${versionId}/sources`)
    .send(source('PRIMARY'))
    .expect(200);
  await editor
    .post(`/admin/v1/calculators/versions/${versionId}/sources`)
    .send(source('UNIT_CONVERSION'))
    .expect(200);
  await editor
    .post(`/admin/v1/calculators/versions/${versionId}/test-cases`)
    .send(cases.result)
    .expect(200);
  await editor
    .post(`/admin/v1/calculators/versions/${versionId}/test-cases`)
    .send(cases.outOfRange)
    .expect(200);
  const run = await editor.post(`/admin/v1/calculators/versions/${versionId}/test-run`).expect(200);
  expect(run.body.testRun).toMatchObject({
    passed: true,
    total: 2,
    failed: 0,
    engineVersion: 'ts-1.0.0',
  });
  await editor.post(`/admin/v1/calculators/versions/${versionId}/submit`).expect(200);
}

async function published(accessTier: 'STUDENT' | 'PROFESSIONAL' = 'STUDENT', demoSample = false) {
  const drafted = await draftedVersion(accessTier, demoSample);
  await readyForReview(drafted.versionId);
  await reviewer
    .post(`/admin/v1/calculators/versions/${drafted.versionId}/publish`)
    .send({ reviewNote: 'Checked against the source' })
    .expect(200);
  return drafted;
}

describe('governance', () => {
  it('refuses an invalid definition with the path of each problem', async () => {
    const { calculatorId, versionId } = await draftedVersion();
    const bad = await editor
      .post(`/admin/v1/calculators/${calculatorId}/versions`)
      .send({ definition: { ...definition(), formula: { input: 'height' } } })
      .expect(409);
    expect(bad.body.error.code).toBe('INVALID_STATE'); // an open draft already exists
    const invalid = await editor
      .put(`/admin/v1/calculators/versions/${versionId}/definition`)
      .send({ definition: { ...definition(), formula: { input: 'height' } } })
      .expect(400);
    expect(invalid.body.error.details.fields.formula).toEqual(['unknown input "height"']);
  });

  it('blocks review until sources and passing tests exist', async () => {
    const { versionId } = await draftedVersion();
    const empty = await editor
      .post(`/admin/v1/calculators/versions/${versionId}/submit`)
      .expect(409);
    expect(empty.body.error.details.fields.version).toEqual(
      expect.arrayContaining([
        'a PRIMARY source is required',
        'at least one test case is required',
        'run the tests on the current definition first',
      ]),
    );

    await editor
      .post(`/admin/v1/calculators/versions/${versionId}/sources`)
      .send(source('PRIMARY'))
      .expect(200);
    await editor
      .post(`/admin/v1/calculators/versions/${versionId}/test-cases`)
      .send(cases.wrong)
      .expect(200);
    const run = await editor
      .post(`/admin/v1/calculators/versions/${versionId}/test-run`)
      .expect(200);
    expect(run.body.testRun.results[0]).toMatchObject({
      passed: false,
      failure: 'expected 7 ± 0.01, got 6',
    });

    const failing = await editor
      .post(`/admin/v1/calculators/versions/${versionId}/submit`)
      .expect(409);
    expect(failing.body.error.details.fields.version).toEqual(
      expect.arrayContaining([
        'the definition converts units: a UNIT_CONVERSION source is required',
        '1 of 1 test case(s) fail',
      ]),
    );
  });

  it('publishes only through an independent reviewer and makes the version current', async () => {
    const { calculatorId, versionId } = await draftedVersion();
    await readyForReview(versionId);

    const editorAttempt = await editor
      .post(`/admin/v1/calculators/versions/${versionId}/publish`)
      .send({ reviewNote: 'Self review' })
      .expect(403);
    expect(editorAttempt.body.error.code).toBe('FORBIDDEN');

    const done = await reviewer
      .post(`/admin/v1/calculators/versions/${versionId}/publish`)
      .send({ reviewNote: 'Checked against the source' })
      .expect(200);
    expect(done.body).toMatchObject({
      status: 'PUBLISHED',
      reviewedBy: { id: reviewer.id },
      authoredBy: { id: editor.id },
      engineVersion: 'ts-1.0.0',
      testRun: { passed: true },
    });
    const calculator = await reviewer.get(`/admin/v1/calculators/${calculatorId}`).expect(200);
    expect(calculator.body.currentVersionId).toBe(versionId);

    const locked = await editor
      .put(`/admin/v1/calculators/versions/${versionId}/definition`)
      .send({ definition: definition(2) })
      .expect(409);
    expect(locked.body.error.code).toBe('INVALID_STATE');
  });

  it('refuses a Super Admin who authored or edited the version (four-eyes applies to everyone)', async () => {
    const slug = `rectangle-${randomUUID().slice(0, 8)}`;
    const calculator = await superAdmin
      .post('/admin/v1/calculators')
      .send({
        slug,
        nameFr: slug,
        nameEn: slug,
        accessTier: 'STUDENT',
        demoSample: false,
        reason: 'New tool',
      })
      .expect(200);
    const version = await superAdmin
      .post(`/admin/v1/calculators/${calculator.body.id}/versions`)
      .send({ definition: definition() })
      .expect(200);
    const id = version.body.id as string;
    await superAdmin
      .post(`/admin/v1/calculators/versions/${id}/sources`)
      .send(source('PRIMARY'))
      .expect(200);
    await superAdmin
      .post(`/admin/v1/calculators/versions/${id}/sources`)
      .send(source('UNIT_CONVERSION'))
      .expect(200);
    await superAdmin
      .post(`/admin/v1/calculators/versions/${id}/test-cases`)
      .send(cases.result)
      .expect(200);
    await superAdmin.post(`/admin/v1/calculators/versions/${id}/test-run`).expect(200);
    await superAdmin.post(`/admin/v1/calculators/versions/${id}/submit`).expect(200);

    const refused = await superAdmin
      .post(`/admin/v1/calculators/versions/${id}/publish`)
      .send({ reviewNote: 'Own work' })
      .expect(403);
    expect(refused.body.error.message).toMatch(/must not have authored or edited/);
    await reviewer
      .post(`/admin/v1/calculators/versions/${id}/publish`)
      .send({ reviewNote: 'Independent review' })
      .expect(200);
  });

  it('refuses a reviewer who contributed to the draft', async () => {
    const { versionId } = await draftedVersion();
    await readyForReview(versionId);
    await reviewer
      .post(`/admin/v1/calculators/versions/${versionId}/return`)
      .send({ reason: 'Add an edge case' })
      .expect(200);
    const contributor = await adminActor(app, 'SUPER_ADMIN');
    await contributor
      .post(`/admin/v1/calculators/versions/${versionId}/test-cases`)
      .send({ ...cases.outOfRange, origin: 'Second edge case' })
      .expect(200);
    await editor.post(`/admin/v1/calculators/versions/${versionId}/test-run`).expect(200);
    await editor.post(`/admin/v1/calculators/versions/${versionId}/submit`).expect(200);
    await contributor
      .post(`/admin/v1/calculators/versions/${versionId}/publish`)
      .send({ reviewNote: 'I added a test' })
      .expect(403);
  });

  it('replaces the published version with the next one and retires versions on demand', async () => {
    const { slug, calculatorId, versionId: v1 } = await published();
    const student = await userActor(app, 'STUDENT');

    const v2 = await editor
      .post(`/admin/v1/calculators/${calculatorId}/versions`)
      .send({ copyFromVersion: 1 })
      .expect(200);
    expect(v2.body).toMatchObject({ version: 2, status: 'DRAFT' });
    expect(v2.body.sources).toHaveLength(2);
    expect(v2.body.testCases).toHaveLength(2);
    await editor.post(`/admin/v1/calculators/versions/${v2.body.id}/test-run`).expect(200);
    await editor.post(`/admin/v1/calculators/versions/${v2.body.id}/submit`).expect(200);
    await reviewer
      .post(`/admin/v1/calculators/versions/${v2.body.id}/publish`)
      .send({ reviewNote: 'v2 checked' })
      .expect(200);

    expect(
      (await reviewer.get(`/admin/v1/calculators/versions/${v1}`).expect(200)).body.status,
    ).toBe('RETIRED');
    const inputs = { inputs: { length: { value: 2 }, width: { value: 3 } } };
    await app
      .http()
      .post(`/v1/calculators/${slug}/versions/1/evaluate`)
      .set(student.auth)
      .send(inputs)
      .expect(410);
    await app
      .http()
      .post(`/v1/calculators/${slug}/versions/2/evaluate`)
      .set(student.auth)
      .send(inputs)
      .expect(200);

    await superAdmin
      .post(`/admin/v1/calculators/versions/${v2.body.id}/retire`)
      .send({ reason: 'Source withdrawn' })
      .expect(200);
    await app.http().get(`/v1/calculators/${slug}`).set(student.auth).expect(410);
    expect(
      (
        (await app.http().get('/v1/calculators').set(student.auth).expect(200)).body as {
          slug: string;
        }[]
      ).some((c) => c.slug === slug),
    ).toBe(false);
  });

  it('audits every step of the workflow', async () => {
    const { versionId } = await published();
    const actions = (
      await app.prisma().auditLogEntry.findMany({
        where: { entityId: versionId },
        orderBy: { id: 'asc' },
        select: { action: true },
      })
    ).map((entry) => entry.action);
    expect(actions).toEqual([
      'calculator.version.created',
      'calculator.version.source_added',
      'calculator.version.source_added',
      'calculator.version.test_case_added',
      'calculator.version.test_case_added',
      'calculator.version.tests_run',
      'calculator.version.submitted',
      'calculator.version.published',
    ]);
  });

  it('keeps the database as the last line of defence', async () => {
    const { versionId } = await draftedVersion();
    await expect(
      app
        .prisma()
        .calculatorVersion.update({ where: { id: versionId }, data: { status: 'PUBLISHED' } }),
    ).rejects.toThrow(/invalid calculator version transition/);
  });
});

describe('using a published calculator', () => {
  it('evaluates for entitled viewers, never shows a number out of range, and locks for others', async () => {
    const { slug } = await published('STUDENT');
    const student = await userActor(app, 'STUDENT');

    const detail = await app.http().get(`/v1/calculators/${slug}`).set(student.auth).expect(200);
    expect(detail.body).toMatchObject({
      version: 1,
      access: { state: 'AVAILABLE' },
      published: {
        version: 1,
        engineVersion: 'ts-1.0.0',
        review: { testsPassed: 2 },
        sources: [{ role: 'PRIMARY' }, { role: 'UNIT_CONVERSION' }],
      },
    });

    const result = await app
      .http()
      .post(`/v1/calculators/${slug}/versions/1/evaluate`)
      .set(student.auth)
      .send({ inputs: { length: { value: 250, unit: 'cm' }, width: { value: 2 } } })
      .expect(200);
    expect(result.body).toMatchObject({
      engine: 'server',
      evaluation: { outcome: 'RESULT', unit: 'm²', decimals: 2 },
    });
    expect(result.body.evaluation.value).toBeCloseTo(5, 12);
    expect(result.body.evaluation.conversions).toEqual([
      { input: 'length', from: { value: 250, unit: 'cm' }, to: { value: 2.5, unit: 'm' } },
    ]);

    const outside = await app
      .http()
      .post(`/v1/calculators/${slug}/versions/1/evaluate`)
      .set(student.auth)
      .send({ inputs: { length: { value: 500 }, width: { value: 1 } } })
      .expect(200);
    expect(outside.body.evaluation.outcome).toBe('OUT_OF_VALIDATED_RANGE');
    expect(outside.body.evaluation.value).toBeUndefined();

    const unpaid = await userActor(app, 'PROFESSIONAL_UNPAID');
    const lockedDetail = await app
      .http()
      .get(`/v1/calculators/${slug}`)
      .set(unpaid.auth)
      .expect(200);
    expect(lockedDetail.body).toMatchObject({
      access: { state: 'LOCKED', lockReason: 'SUBSCRIPTION_REQUIRED' },
      published: null,
    });
    const refused = await app
      .http()
      .post(`/v1/calculators/${slug}/versions/1/evaluate`)
      .set(unpaid.auth)
      .send({ inputs: {} })
      .expect(403);
    expect(refused.body.error.code).toBe('FEATURE_LOCKED');

    const demo = await demoActor(app);
    const demoDetail = await app.http().get(`/v1/calculators/${slug}`).set(demo.auth).expect(200);
    expect(demoDetail.body.access).toMatchObject({ state: 'LOCKED', lockReason: 'DEMO_LIMIT' });
  });

  it('opens a professional-tier calculator to professionals only, and demo samples to the demo', async () => {
    const professionalOnly = await published('PROFESSIONAL');
    const sample = await published('PROFESSIONAL', true);
    const student = await userActor(app, 'STUDENT');
    const professional = await userActor(app, 'PROFESSIONAL');
    const demo = await demoActor(app);
    const accessOf = async (auth: Record<string, string>, slug: string) =>
      (await app.http().get(`/v1/calculators/${slug}`).set(auth).expect(200)).body.access;

    expect(await accessOf(student.auth, professionalOnly.slug)).toMatchObject({
      state: 'LOCKED',
      lockReason: 'PROFESSIONAL_ONLY',
    });
    expect(await accessOf(professional.auth, professionalOnly.slug)).toMatchObject({
      state: 'AVAILABLE',
    });
    expect(await accessOf(demo.auth, sample.slug)).toMatchObject({ state: 'AVAILABLE' });
  });

  it('ships published definitions and their test cases in the offline manifest', async () => {
    const { calculatorId } = await published('STUDENT');
    const student = await userActor(app, 'STUDENT');
    const manifest = await app.http().get('/v1/offline/manifest').set(student.auth).expect(200);
    const entry = manifest.body.calculators.find(
      (calculator: { id: string }) => calculator.id === calculatorId,
    );
    expect(entry).toMatchObject({ published: { version: 1, definition: { schemaVersion: 1 } } });
    expect(entry.testCases).toHaveLength(2);
  });
});
