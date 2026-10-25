// ADR-027: merging duplicate substances of « Grossesse · Allaitement ». Names move, clinical content
// never does; links keep working; the merge can be undone.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AdminActor, adminActor, userActor } from './actors.js';
import { useTestApp } from './app.js';
import { xlsx } from '../support/xlsx.js';

const app = useTestApp();
let author: AdminActor;
let reviewer: AdminActor;
let professional: Record<string, string>;
let sourceIds: string[];

const text = (fr: string) => ({ fr });
const period = (conduct: string | null) => ({
  conduct,
  ...(conduct ? { conductDetail: text('Éviter par prudence.') } : {}),
  evidence: { level: 2 },
});
const content = (alternatives: string[] = []) => ({
  pregnancy: {
    periods: { T1: period('AVOID'), T2: period(null), T3: period(null), PERIPARTUM: period(null) },
    alternatives,
  },
  lactation: {
    conduct: null,
    conductText: text("Compatible avec l'allaitement."),
    evidence: { level: 3 },
    alternatives: [],
  },
});

async function substance(name: string, synonyms: string[] = []): Promise<string> {
  const created = await author
    .post('/admin/v1/pregnancy/substances')
    .send({ nameFr: name, synonyms, reason: 'Création' })
    .expect(200);
  return created.body.id;
}

async function publish(id: string, alternatives: string[] = []): Promise<void> {
  const draft = await author
    .post(`/admin/v1/pregnancy/substances/${id}/versions`)
    .send({ reason: 'Profil' })
    .expect(200);
  await author
    .put(`/admin/v1/pregnancy/versions/${draft.body.id}`)
    .send({ content: content(alternatives), sourceIds })
    .expect(200);
  await author
    .post(`/admin/v1/pregnancy/versions/${draft.body.id}/submit`)
    .send({ reason: 'Relecture' })
    .expect(200);
  await reviewer
    .post(`/admin/v1/pregnancy/versions/${draft.body.id}/approve`)
    .send({ comment: 'Relu' })
    .expect(200);
}

const search = async (q: string) =>
  (
    await app
      .http()
      .get(`/v1/pregnancy/substances/search?q=${encodeURIComponent(q)}`)
      .set(professional)
      .expect(200)
  ).body as { total: number; items: { id: string; nameFr: string }[] };

beforeAll(async () => {
  author = await adminActor(app, 'CALCULATOR_EDITOR');
  reviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  professional = (await userActor(app, 'PROFESSIONAL')).auth;
  const source = await author
    .post('/admin/v1/pregnancy/sources')
    .send({ title: 'CRAT', type: 'REFERENCE', year: 2026 })
    .expect(200);
  sourceIds = [source.body.id];
});

describe('merging a duplicate', () => {
  const tag = randomUUID().slice(0, 6);
  let keep: string;
  let duplicate: string;
  let referrer: string;

  it('is a reviewer decision, previewed, and asks to acknowledge a hidden published profile', async () => {
    keep = await substance(`Amoxicilline ${tag}`, ['Clamoxyl']);
    duplicate = await substance(`Amoxicilline acide ${tag}`, ['Augmentin', 'clamoxyl']);
    await publish(keep);
    await publish(duplicate);
    // A third profile lists the duplicate as an alternative, and so does the kept one.
    referrer = await substance(`Céfalexine ${tag}`);
    await publish(referrer, [duplicate]);

    await author
      .get(`/admin/v1/pregnancy/substances/${duplicate}/merge-preview?into=${keep}`)
      .expect(403);
    const preview = await reviewer
      .get(`/admin/v1/pregnancy/substances/${duplicate}/merge-preview?into=${keep}`)
      .expect(200);
    expect(preview.body).toMatchObject({
      source: { id: duplicate },
      target: { id: keep },
      namesToAdd: [`Amoxicilline acide ${tag}`, 'Augmentin'],
      sourcePublishedVersion: 1,
      blockers: [],
    });

    const refused = await reviewer
      .post(`/admin/v1/pregnancy/substances/${duplicate}/merge`)
      .send({ into: keep, reason: 'Doublon', acknowledgeHiddenProfile: false })
      .expect(400);
    expect(refused.body.error.details.fields.acknowledgeHiddenProfile).toBeDefined();
  });

  it('moves the names, archives the duplicate, and keeps links working', async () => {
    const merged = await reviewer
      .post(`/admin/v1/pregnancy/substances/${duplicate}/merge`)
      .send({ into: keep, reason: 'Doublon de saisie', acknowledgeHiddenProfile: true })
      .expect(200);
    expect(merged.body).toMatchObject({
      enabled: false,
      mergedInto: { id: keep, nameFr: `Amoxicilline ${tag}` },
    });
    const kept = await reviewer.get(`/admin/v1/pregnancy/substances/${keep}`).expect(200);
    expect(kept.body.synonyms).toEqual(['Clamoxyl', `Amoxicilline acide ${tag}`, 'Augmentin']);

    // Search by the duplicate's name finds the kept substance, once.
    const hits = await search(`acide ${tag}`);
    expect(hits.items.map((hit) => hit.id)).toEqual([keep]);
    // An old link (favorite, history) opens the kept profile.
    const opened = await app
      .http()
      .get(`/v1/pregnancy/substances/${duplicate}`)
      .set(professional)
      .expect(200);
    expect(opened.body.id).toBe(keep);
    // An alternative pointing at the duplicate shows the kept substance, with its original id.
    const third = await app
      .http()
      .get(`/v1/pregnancy/substances/${referrer}`)
      .set(professional)
      .expect(200);
    expect(third.body.alternatives).toEqual([
      { id: duplicate, nameFr: `Amoxicilline ${tag}`, nameEn: null },
    ]);

    // A merged duplicate gets no new version.
    await author
      .post(`/admin/v1/pregnancy/substances/${duplicate}/versions`)
      .send({ reason: 'Essai' })
      .expect(409);
    // Showing the duplicate again needs the merge undone first.
    const shown = await reviewer
      .patch(`/admin/v1/pregnancy/substances/${duplicate}/visibility`)
      .send({ enabled: true, reason: 'Réafficher' })
      .expect(409);
    expect(shown.body.error.code).toBe('INVALID_STATE');
  });

  it('refuses chains, open versions and merging into a merged substance', async () => {
    const other = await substance(`Pénicilline ${tag}`);
    const into = await reviewer
      .get(`/admin/v1/pregnancy/substances/${other}/merge-preview?into=${duplicate}`)
      .expect(200);
    expect(into.body.blockers).toEqual(
      expect.arrayContaining(['TARGET_MERGED', 'TARGET_ARCHIVED']),
    );
    const chain = await reviewer
      .get(`/admin/v1/pregnancy/substances/${keep}/merge-preview?into=${other}`)
      .expect(200);
    expect(chain.body.blockers).toContain('SOURCE_HAS_MERGED');
    await author
      .post(`/admin/v1/pregnancy/substances/${other}/versions`)
      .send({ reason: 'Brouillon' })
      .expect(200);
    const open = await reviewer
      .get(`/admin/v1/pregnancy/substances/${other}/merge-preview?into=${keep}`)
      .expect(200);
    expect(open.body.blockers).toContain('SOURCE_OPEN_VERSION');
    const refused = await reviewer
      .post(`/admin/v1/pregnancy/substances/${other}/merge`)
      .send({ into: keep, reason: 'Essai', acknowledgeHiddenProfile: true })
      .expect(409);
    expect(refused.body.error.details.fields.merge).toContain('SOURCE_OPEN_VERSION');
  });

  it('lets an import match the kept substance by the duplicate name', async () => {
    const preview = await author
      .post('/admin/v1/pregnancy/imports')
      .attach(
        'file',
        xlsx([
          ['Médicament', 'Période', 'Statut'],
          [`Amoxicilline acide ${tag}`, 'T2', 'Valide'],
        ]),
        'fusion.xlsx',
      )
      .expect(200);
    expect(preview.body.rows[0].issues).toContainEqual(
      expect.objectContaining({
        code: 'SUBSTANCE_EXISTING',
        params: { name: `Amoxicilline ${tag}` },
      }),
    );
    await author
      .post(`/admin/v1/pregnancy/imports/${preview.body.id}/discard`)
      .send({ reason: 'Test' })
      .expect(204);
  });

  it('can be undone: the names leave, the duplicate stands alone again, still archived', async () => {
    const undone = await reviewer
      .post(`/admin/v1/pregnancy/substances/${duplicate}/unmerge`)
      .send({ reason: 'Fusion par erreur' })
      .expect(200);
    expect(undone.body).toMatchObject({ enabled: false, mergedInto: null });
    const kept = await reviewer.get(`/admin/v1/pregnancy/substances/${keep}`).expect(200);
    expect(kept.body.synonyms).toEqual(['Clamoxyl']);
    expect((await search(`acide ${tag}`)).total).toBe(0);
    await app.http().get(`/v1/pregnancy/substances/${duplicate}`).set(professional).expect(410);
    // Showing it again is now a normal visibility decision.
    await reviewer
      .patch(`/admin/v1/pregnancy/substances/${duplicate}/visibility`)
      .send({ enabled: true, reason: 'Réafficher' })
      .expect(200);
    expect((await search(`acide ${tag}`)).items.map((hit) => hit.id)).toEqual([duplicate]);
  });
});
