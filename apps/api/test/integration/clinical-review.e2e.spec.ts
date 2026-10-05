// ADR-024: double sign-off for clinical content. With two sign-offs required, the first independent
// approval is recorded and the version stays in review; a second, different reviewer publishes.
// The fixture calculator is deliberately non-clinical (a rectangle area), as in calculators.e2e.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type AdminActor, adminActor } from './actors.js';
import { useTestApp } from './app.js';

const app = useTestApp();
let editor: AdminActor;
let firstReviewer: AdminActor;
let secondReviewer: AdminActor;
let superAdmin: AdminActor;
let sourceIds: string[];

beforeAll(async () => {
  editor = await adminActor(app, 'CALCULATOR_EDITOR');
  firstReviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  secondReviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  superAdmin = await adminActor(app, 'SUPER_ADMIN');
  sourceIds = [];
  for (const title of ['CRAT', 'LactMed']) {
    const source = await editor
      .post('/admin/v1/pregnancy/sources')
      .send({ title, type: 'REFERENCE', edition: '10/2026', year: 2026 })
      .expect(200);
    sourceIds.push(source.body.id);
  }
});

// The policy is platform-wide: every test starts from one sign-off, and the file leaves it there.
const resetPolicies = () => app.prisma().clinicalReviewPolicy.deleteMany();
beforeEach(resetPolicies);
afterAll(resetPolicies);

const requireTwo = (content: 'CALCULATOR' | 'PREGNANCY_PROFILE') =>
  superAdmin
    .put(`/admin/v1/clinical-review/policies/${content}`)
    .send({ requiredSignOffs: 2, reason: 'Deux relecteurs pour le contenu clinique' })
    .expect(200);

// ───────────────────────────── calculators ─────────────────────────────

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

/** A rectangle calculator version submitted for review. */
async function calculatorInReview(): Promise<string> {
  const slug = `rectangle-${randomUUID().slice(0, 8)}`;
  const calculator = await editor
    .post('/admin/v1/calculators')
    .send({
      slug,
      nameFr: `Rectangle ${slug}`,
      nameEn: `Rectangle ${slug}`,
      accessTier: 'STUDENT',
      demoSample: false,
      reason: 'New tool',
    })
    .expect(200);
  const version = await editor
    .post(`/admin/v1/calculators/${calculator.body.id}/versions`)
    .send({
      definition: {
        schemaVersion: 1,
        inputs: [side('length'), side('width')],
        formula: { op: 'mul', args: [{ input: 'length' }, { input: 'width' }] },
        result: { unit: 'm²', decimals: 2, label: t('Surface', 'Area') },
        limitations: t('Fixture de test, non clinique.', 'Test fixture, not clinical.'),
      },
    })
    .expect(200);
  const versionId = version.body.id as string;
  for (const role of ['PRIMARY', 'UNIT_CONVERSION']) {
    await editor
      .post(`/admin/v1/calculators/versions/${versionId}/sources`)
      .send({
        role,
        authors: 'Test Author',
        title: `Test source (${role})`,
        publisher: 'Test Publisher',
        year: 2024,
        formulaLocation: 'p. 1',
        accessedAt: '2026-09-20',
      })
      .expect(200);
  }
  await editor
    .post(`/admin/v1/calculators/versions/${versionId}/test-cases`)
    .send({
      inputs: { length: { value: 2 }, width: { value: 3 } },
      expectedOutcome: 'RESULT',
      expectedValue: 6,
      tolerance: 1e-9,
      origin: 'Worked example',
    })
    .expect(200);
  await editor.post(`/admin/v1/calculators/versions/${versionId}/test-run`).expect(200);
  await editor.post(`/admin/v1/calculators/versions/${versionId}/submit`).expect(200);
  return versionId;
}

const approveCalculator = (reviewer: AdminActor, versionId: string) =>
  reviewer
    .post(`/admin/v1/calculators/versions/${versionId}/publish`)
    .send({ reviewNote: 'Vérifié contre la source' });

describe('policy', () => {
  it('starts at one sign-off and is set by the Super Admin only', async () => {
    const policies = await superAdmin.get('/admin/v1/clinical-review/policies').expect(200);
    expect(policies.body).toEqual([
      expect.objectContaining({ content: 'CALCULATOR', requiredSignOffs: 1, updatedBy: null }),
      expect.objectContaining({ content: 'PREGNANCY_PROFILE', requiredSignOffs: 1 }),
    ]);
    expect(policies.body[0].eligibleReviewers).toBeGreaterThanOrEqual(3);

    const refused = await firstReviewer
      .put('/admin/v1/clinical-review/policies/CALCULATOR')
      .send({ requiredSignOffs: 2, reason: 'Je relis seul' })
      .expect(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');

    const set = await requireTwo('CALCULATOR');
    expect(set.body).toMatchObject({
      content: 'CALCULATOR',
      requiredSignOffs: 2,
      updatedBy: { id: superAdmin.id },
    });
    const audit = await app.prisma().auditLogEntry.findFirst({
      where: { action: 'clinical_review.policy.updated', entityId: 'CALCULATOR' },
      orderBy: { id: 'desc' },
    });
    expect(audit).toMatchObject({
      actorId: superAdmin.id,
      before: { requiredSignOffs: 1 },
      after: { requiredSignOffs: 2 },
    });
  });

  it('accepts only one or two sign-offs', async () => {
    await superAdmin
      .put('/admin/v1/clinical-review/policies/CALCULATOR')
      .send({ requiredSignOffs: 3, reason: 'Trois relecteurs' })
      .expect(400);
  });
});

describe('calculators', () => {
  it('keeps the first approval in review and publishes on a second, different reviewer', async () => {
    await requireTwo('CALCULATOR');
    const versionId = await calculatorInReview();

    const pending = await editor.get(`/admin/v1/calculators/versions/${versionId}`).expect(200);
    expect(pending.body).toMatchObject({ requiredSignOffs: 2, firstSignOffBy: null });

    const first = await approveCalculator(firstReviewer, versionId).expect(200);
    expect(first.body).toMatchObject({
      status: 'IN_REVIEW',
      requiredSignOffs: 2,
      firstSignOffBy: { id: firstReviewer.id },
      firstSignOffNote: 'Vérifié contre la source',
      reviewedBy: null,
      publishedAt: null,
    });

    const again = await approveCalculator(firstReviewer, versionId).expect(403);
    expect(again.body.error.code).toBe('FORBIDDEN');
    await approveCalculator(editor, versionId).expect(403);

    const second = await approveCalculator(secondReviewer, versionId).expect(200);
    expect(second.body).toMatchObject({
      status: 'PUBLISHED',
      requiredSignOffs: 2,
      firstSignOffBy: { id: firstReviewer.id },
      reviewedBy: { id: secondReviewer.id },
    });
    const actions = await app.prisma().auditLogEntry.findMany({
      where: { entityId: versionId, action: { startsWith: 'calculator.version.' } },
      orderBy: { id: 'asc' },
      select: { action: true, actorId: true },
    });
    expect(actions.slice(-2)).toEqual([
      { action: 'calculator.version.signed_off', actorId: firstReviewer.id },
      { action: 'calculator.version.published', actorId: secondReviewer.id },
    ]);
  });

  it('asks for a fresh first sign-off after the version went back to its author', async () => {
    await requireTwo('CALCULATOR');
    const versionId = await calculatorInReview();
    await approveCalculator(firstReviewer, versionId).expect(200);
    const returned = await secondReviewer
      .post(`/admin/v1/calculators/versions/${versionId}/return`)
      .send({ reason: 'La source citée ne correspond pas' })
      .expect(200);
    expect(returned.body).toMatchObject({ status: 'DRAFT', firstSignOffBy: null });

    await editor.post(`/admin/v1/calculators/versions/${versionId}/submit`).expect(200);
    const signed = await approveCalculator(secondReviewer, versionId).expect(200);
    expect(signed.body).toMatchObject({
      status: 'IN_REVIEW',
      firstSignOffBy: { id: secondReviewer.id },
    });
  });

  it('never relaxes a version already in review when the policy is lowered', async () => {
    await requireTwo('CALCULATOR');
    const versionId = await calculatorInReview();
    await superAdmin
      .put('/admin/v1/clinical-review/policies/CALCULATOR')
      .send({ requiredSignOffs: 1, reason: 'Retour à un relecteur' })
      .expect(200);
    const first = await approveCalculator(firstReviewer, versionId).expect(200);
    expect(first.body.status).toBe('IN_REVIEW');

    const next = await calculatorInReview();
    const single = await approveCalculator(firstReviewer, next).expect(200);
    expect(single.body).toMatchObject({ status: 'PUBLISHED', requiredSignOffs: 1 });
  });

  it('keeps the database as the last line of defence', async () => {
    await requireTwo('CALCULATOR');
    const versionId = await calculatorInReview();
    await expect(
      app.prisma().calculatorVersion.update({
        where: { id: versionId },
        data: {
          firstSignOffById: editor.id,
          firstSignOffAt: new Date(),
          firstSignOffNote: 'Auto-relecture',
        },
      }),
    ).rejects.toThrow(/calculator_versions_first_sign_off_chk/);
  });
});

// ───────────────────────── pregnancy profiles ─────────────────────────

const text = (fr: string) => ({ fr });
const period = (level: number) => ({
  conduct: null,
  riskContext: text('Contexte de risque documenté.'),
  evidence: { level, population: text('cohortes concordantes') },
  considerations: text('Préférer la durée la plus courte.'),
});

/** A profile version submitted for review. */
async function profileInReview(): Promise<string> {
  const suffix = randomUUID().slice(0, 6);
  const substance = await editor
    .post('/admin/v1/pregnancy/substances')
    .send({ nameFr: `Substance ${suffix}`, reason: 'Création du profil' })
    .expect(200);
  const draft = await editor
    .post(`/admin/v1/pregnancy/substances/${substance.body.id}/versions`)
    .send({ reason: 'Premier profil' })
    .expect(200);
  await editor
    .put(`/admin/v1/pregnancy/versions/${draft.body.id}`)
    .send({
      content: {
        pregnancy: {
          periods: { T1: period(2), T2: period(2), T3: period(3), PERIPARTUM: period(3) },
          alternatives: [],
        },
        lactation: {
          conduct: null,
          conductText: text("Compatible avec l'allaitement."),
          evidence: { level: 3 },
          alternatives: [],
        },
      },
      sourceIds,
    })
    .expect(200);
  await editor
    .post(`/admin/v1/pregnancy/versions/${draft.body.id}/submit`)
    .send({ reason: 'Prêt pour relecture' })
    .expect(200);
  return draft.body.id as string;
}

const approveProfile = (reviewer: AdminActor, versionId: string) =>
  reviewer
    .post(`/admin/v1/pregnancy/versions/${versionId}/approve`)
    .send({ comment: 'Relu contre les sources' });

describe('pregnancy profiles', () => {
  it('needs two different reviewers when the policy asks for it', async () => {
    await requireTwo('PREGNANCY_PROFILE');
    const versionId = await profileInReview();

    const first = await approveProfile(firstReviewer, versionId).expect(200);
    expect(first.body).toMatchObject({
      status: 'IN_REVIEW',
      requiredSignOffs: 2,
      firstSignOffBy: { id: firstReviewer.id },
      publishedAt: null,
    });
    await approveProfile(firstReviewer, versionId).expect(403);

    const second = await approveProfile(secondReviewer, versionId).expect(200);
    expect(second.body).toMatchObject({
      status: 'PUBLISHED',
      firstSignOffBy: { id: firstReviewer.id },
      reviewedBy: { id: secondReviewer.id },
    });
  });

  it('clears the first sign-off when changes are requested', async () => {
    await requireTwo('PREGNANCY_PROFILE');
    const versionId = await profileInReview();
    await approveProfile(firstReviewer, versionId).expect(200);
    const sentBack = await secondReviewer
      .post(`/admin/v1/pregnancy/versions/${versionId}/request-changes`)
      .send({ comment: 'Préciser la population étudiée' })
      .expect(200);
    expect(sentBack.body).toMatchObject({ status: 'CHANGES_REQUESTED', firstSignOffBy: null });
  });

  it('publishes on one approval while the policy is one sign-off', async () => {
    const versionId = await profileInReview();
    const done = await approveProfile(firstReviewer, versionId).expect(200);
    expect(done.body).toMatchObject({
      status: 'PUBLISHED',
      requiredSignOffs: 1,
      firstSignOffBy: null,
    });
  });
});
