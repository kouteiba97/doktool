// Phase 19: « Grossesse · Allaitement » (ADR-019) — authored, sourced, reviewed by someone other
// than the author, then shown to the app with the server's access decision.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AdminActor, adminActor, demoActor, userActor } from './actors.js';
import { useTestApp } from './app.js';

const app = useTestApp();
let author: AdminActor;
let reviewer: AdminActor;
let sourceIds: string[];

const text = (fr: string) => ({ fr });
const period = (level: number, conduct: string | null = null) => ({
  conduct,
  ...(conduct ? { conductDetail: text('Contre-indiqué à partir de 24 SA.') } : {}),
  riskContext: text('Contexte de risque documenté.'),
  evidence: { level, population: text('cohortes concordantes') },
  considerations: text('Préférer la durée la plus courte.'),
});

function completeContent(alternative: string, conflictSources: string[]) {
  return {
    pregnancy: {
      periods: {
        T1: period(2, 'AVOID'),
        T2: period(3, 'AVOID'),
        T3: period(4, 'CONTRAINDICATED'),
        PERIPARTUM: period(4, 'CONTRAINDICATED'),
      },
      alternatives: [alternative],
      conflict: { sourceIds: conflictSources, synthesis: text('Synthèse des relecteurs.') },
    },
    lactation: {
      conduct: null,
      conductText: text("Compatible avec l'allaitement."),
      relativeInfantDose: '0,6 %',
      maternalHalfLife: '2 h',
      evidence: { level: 3 },
      alternatives: [],
    },
  };
}

async function substance(admin: AdminActor, nameFr: string): Promise<string> {
  const created = await admin
    .post('/admin/v1/pregnancy/substances')
    .send({ nameFr, synonyms: [`${nameFr} 400`], reason: 'Création du profil' })
    .expect(200);
  return created.body.id;
}

beforeAll(async () => {
  author = await adminActor(app, 'CALCULATOR_EDITOR');
  reviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  sourceIds = [];
  for (const title of ['CRAT', 'LactMed']) {
    const source = await author
      .post('/admin/v1/pregnancy/sources')
      .send({ title, type: 'REFERENCE', edition: '09/2026', year: 2026 })
      .expect(200);
    sourceIds.push(source.body.id);
  }
});

/** A substance with a published profile, returned with its alternative. */
async function publishedSubstance(options: { demoSample?: boolean } = {}) {
  const suffix = randomUUID().slice(0, 6);
  const alternative = await substance(author, `Paracétamol ${suffix}`);
  const id = await substance(author, `Ibuprofène ${suffix}`);
  const draft = await author
    .post(`/admin/v1/pregnancy/substances/${id}/versions`)
    .send({ reason: 'Premier profil' })
    .expect(200);
  await author
    .put(`/admin/v1/pregnancy/versions/${draft.body.id}`)
    .send({ content: completeContent(alternative, sourceIds), sourceIds })
    .expect(200);
  await author
    .post(`/admin/v1/pregnancy/versions/${draft.body.id}/submit`)
    .send({ reason: 'Prêt pour relecture' })
    .expect(200);
  await reviewer
    .post(`/admin/v1/pregnancy/versions/${draft.body.id}/approve`)
    .send({ comment: 'Relu et validé' })
    .expect(200);
  if (options.demoSample) {
    await reviewer
      .patch(`/admin/v1/pregnancy/substances/${id}/visibility`)
      .send({ demoSample: true, reason: 'Échantillon de démo' })
      .expect(200);
  }
  return { id, alternative, versionId: draft.body.id as string, name: `Ibuprofène ${suffix}` };
}

describe('authoring and review', () => {
  it('keeps an incomplete draft out of review, and lists what is missing', async () => {
    const id = await substance(author, `Amoxicilline ${randomUUID().slice(0, 6)}`);
    const draft = await author
      .post(`/admin/v1/pregnancy/substances/${id}/versions`)
      .send({ reason: 'Premier profil' })
      .expect(200);
    expect(draft.body.status).toBe('DRAFT');
    expect(draft.body.problems).toEqual(
      expect.arrayContaining([
        'sources: at least one source is required',
        'pregnancy: the pregnancy block is required',
        'lactation: the lactation block is required',
      ]),
    );
    const refused = await author
      .post(`/admin/v1/pregnancy/versions/${draft.body.id}/submit`)
      .send({ reason: 'Trop tôt' })
      .expect(409);
    expect(refused.body.error.code).toBe('INVALID_STATE');

    // A malformed profile never reaches the database.
    await author
      .put(`/admin/v1/pregnancy/versions/${draft.body.id}`)
      .send({ content: { pregnancy: { verdict: 'safe' }, lactation: null }, sourceIds: [] })
      .expect(400);
  });

  it('is never reviewed by its author, and publishing supersedes the previous version', async () => {
    const { id, versionId } = await publishedSubstance();
    const next = await author
      .post(`/admin/v1/pregnancy/substances/${id}/versions`)
      .send({ reason: 'Mise à jour CRAT' })
      .expect(200);
    expect(next.body.version).toBe(2);
    expect(next.body.sources).toHaveLength(2);
    await author
      .post(`/admin/v1/pregnancy/versions/${next.body.id}/submit`)
      .send({ reason: 'Mise à jour' })
      .expect(200);

    const self = await adminActor(app, 'SUPER_ADMIN');
    const own = await self
      .post(
        `/admin/v1/pregnancy/substances/${await substance(self, `Self ${randomUUID().slice(0, 6)}`)}/versions`,
      )
      .send({ reason: 'Auto-relecture' })
      .expect(200);
    await self
      .put(`/admin/v1/pregnancy/versions/${own.body.id}`)
      .send({ content: completeContent(id, sourceIds), sourceIds })
      .expect(200);
    await self
      .post(`/admin/v1/pregnancy/versions/${own.body.id}/submit`)
      .send({ reason: 'Prêt' })
      .expect(200);
    await self
      .post(`/admin/v1/pregnancy/versions/${own.body.id}/approve`)
      .send({ comment: 'Moi-même' })
      .expect(403);

    await reviewer
      .post(`/admin/v1/pregnancy/versions/${next.body.id}/approve`)
      .send({ comment: 'Validé' })
      .expect(200);
    const detail = await reviewer.get(`/admin/v1/pregnancy/substances/${id}`).expect(200);
    expect(detail.body.versions.map((v: { status: string }) => v.status)).toEqual([
      'PUBLISHED',
      'SUPERSEDED',
    ]);
    expect(detail.body.published.version).toBe(2);
    // The database refuses it too (raw SQL keeps the trigger's message).
    await expect(
      app.prisma()
        .$executeRaw`UPDATE substance_profile_versions SET change_reason = 'réécrit' WHERE id = ${versionId}::uuid`,
    ).rejects.toThrow(/immutable/);
  });

  it('lets only a reviewer change who sees a profile', async () => {
    const id = await substance(author, `Métformine ${randomUUID().slice(0, 6)}`);
    await author
      .patch(`/admin/v1/pregnancy/substances/${id}/visibility`)
      .send({ demoSample: true, reason: 'Démo' })
      .expect(403);
    // Visibility is not a field of the names endpoint.
    await author
      .patch(`/admin/v1/pregnancy/substances/${id}`)
      .send({ demoSample: true, reason: 'Démo' })
      .expect(400);
    await author
      .patch(`/admin/v1/pregnancy/substances/${id}`)
      .send({ synonyms: ['Glucophage', ' glucophage '], reason: 'Nom commercial' })
      .expect(200)
      .expect(({ body }) => expect(body.synonyms).toEqual(['Glucophage']));
  });
});

describe('in the app', () => {
  it('opens a published profile for a professional, with sources and alternatives', async () => {
    const { id, alternative, name } = await publishedSubstance();
    const { auth } = await userActor(app, 'PROFESSIONAL');
    const listed = await app.http().get('/v1/pregnancy/substances').set(auth).expect(200);
    expect(listed.body.some((item: { id: string }) => item.id === id)).toBe(true);

    const profile = await app.http().get(`/v1/pregnancy/substances/${id}`).set(auth).expect(200);
    expect(profile.body.access.state).toBe('AVAILABLE');
    expect(profile.body.content.pregnancy.periods.T3.conduct).toBe('CONTRAINDICATED');
    expect(profile.body.alternatives).toEqual([expect.objectContaining({ id: alternative })]);
    expect(profile.body.sources.map((s: { title: string }) => s.title).sort()).toEqual([
      'CRAT',
      'LactMed',
    ]);
    expect(profile.body.reviewerName).toBe('Test CLINICAL_REVIEWER');
    expect(profile.body.underReview).toBe(false);

    // Found by name, synonym and the « grossesse » intent in global search.
    const search = await app
      .http()
      .get('/v1/search')
      .query({ q: `grossesse ${name}` })
      .set(auth)
      .expect(200);
    expect(search.body.groups[0].type).toBe('PREGNANCY');
    expect(search.body.groups[0].hits[0].id).toBe(id);
    expect(search.body.groups[0].hits[0].terms).toBeUndefined();
  });

  it('is a favorite, a history entry and part of the offline store of a professional', async () => {
    const { id, name } = await publishedSubstance();
    const { auth } = await userActor(app, 'PROFESSIONAL');

    await app.http().put(`/v1/me/favorites/SUBSTANCE/${id}`).set(auth).expect(204);
    await app.http().put(`/v1/me/favorites/SUBSTANCE/${randomUUID()}`).set(auth).expect(404);
    const favorites = await app.http().get('/v1/me/favorites').set(auth).expect(200);
    expect(favorites.body).toContainEqual(
      expect.objectContaining({
        targetType: 'SUBSTANCE',
        targetId: id,
        item: expect.objectContaining({ kind: 'SUBSTANCE', titleFr: name }),
      }),
    );

    await app
      .http()
      .post('/v1/me/activity')
      .set(auth)
      .send({
        deviceId: `device-${randomUUID()}`,
        entries: [{ kind: 'PREGNANCY_VIEW', targetId: id, occurredAt: new Date().toISOString() }],
      })
      .expect(204);
    const history = await app.http().get('/v1/me/activity').set(auth).expect(200);
    expect(history.body[0]).toMatchObject({
      kind: 'PREGNANCY_VIEW',
      targetType: 'SUBSTANCE',
      targetId: id,
    });

    const manifest = await app.http().get('/v1/offline/manifest').set(auth).expect(200);
    const offline = manifest.body.substances.find((entry: { id: string }) => entry.id === id);
    expect(offline).toMatchObject({ nameFr: name, access: { state: 'AVAILABLE' } });
    expect(offline.content.pregnancy.periods.T3.conduct).toBe('CONTRAINDICATED');
    expect(offline.sources).toHaveLength(2);
  });

  it('keeps a profile listed but locked for a student and a demo, except demo samples', async () => {
    const locked = await publishedSubstance();
    const sample = await publishedSubstance({ demoSample: true });
    const { auth: student } = await userActor(app, 'STUDENT');
    const lockedForStudent = await app
      .http()
      .get(`/v1/pregnancy/substances/${locked.id}`)
      .set(student)
      .expect(200);
    expect(lockedForStudent.body.access).toMatchObject({
      state: 'LOCKED',
      lockReason: 'PROFESSIONAL_ONLY',
    });
    expect(lockedForStudent.body.content).toBeNull();
    expect(lockedForStudent.body.sources).toEqual([]);

    const demo = await demoActor(app);
    const lockedForDemo = await app
      .http()
      .get(`/v1/pregnancy/substances/${locked.id}`)
      .set(demo.auth)
      .expect(200);
    expect(lockedForDemo.body.access.lockReason).toBe('DEMO_LIMIT');
    const open = await app
      .http()
      .get(`/v1/pregnancy/substances/${sample.id}`)
      .set(demo.auth)
      .expect(200);
    expect(open.body.access.state).toBe('AVAILABLE');
    expect(open.body.content).not.toBeNull();
  });

  it('shows « under review » while a newer version waits, and hides a disabled substance', async () => {
    const { id } = await publishedSubstance();
    const { auth } = await userActor(app, 'PROFESSIONAL');
    const next = await author
      .post(`/admin/v1/pregnancy/substances/${id}/versions`)
      .send({ reason: 'Correction' })
      .expect(200);
    await author
      .post(`/admin/v1/pregnancy/versions/${next.body.id}/submit`)
      .send({ reason: 'Correction' })
      .expect(200);
    const profile = await app.http().get(`/v1/pregnancy/substances/${id}`).set(auth).expect(200);
    expect(profile.body.underReview).toBe(true);
    expect(profile.body.version).toBe(1);

    await reviewer
      .patch(`/admin/v1/pregnancy/substances/${id}/visibility`)
      .send({ enabled: false, reason: 'Retiré' })
      .expect(200);
    await app.http().get(`/v1/pregnancy/substances/${id}`).set(auth).expect(410);
  });

  it('takes error reports from people who can read the profile, for the clinical team', async () => {
    const { id } = await publishedSubstance();
    const { auth } = await userActor(app, 'PROFESSIONAL');
    await app
      .http()
      .post(`/v1/pregnancy/substances/${id}/reports`)
      .set(auth)
      .send({ section: 'LACTATION', reason: 'OUTDATED', comment: 'Nouvelle donnée LactMed 2026.' })
      .expect(204);
    const { auth: student } = await userActor(app, 'STUDENT');
    await app
      .http()
      .post(`/v1/pregnancy/substances/${id}/reports`)
      .set(student)
      .send({ section: 'PREGNANCY', reason: 'OTHER' })
      .expect(403);

    const reports = await author
      .get('/admin/v1/pregnancy/reports')
      .query({ substanceId: id })
      .expect(200);
    expect(reports.body).toHaveLength(1);
    expect(reports.body[0]).toMatchObject({ section: 'LACTATION', reason: 'OUTDATED', version: 1 });
    await author
      .post(`/admin/v1/pregnancy/reports/${reports.body[0].id}/resolve`)
      .send({ resolution: 'Profil mis à jour en v2' })
      .expect(204);
    const open = await author
      .get('/admin/v1/pregnancy/reports')
      .query({ substanceId: id })
      .expect(200);
    expect(open.body).toHaveLength(0);
  });
});
