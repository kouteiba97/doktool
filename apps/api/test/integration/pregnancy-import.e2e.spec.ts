// ADR-025: spreadsheet import into « Grossesse · Allaitement », end to end on the test database.
// An import only ever produces drafts; publication still needs a different reviewer.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AdminActor, adminActor, userActor } from './actors.js';
import { useTestApp } from './app.js';
import { type TestCell, xlsx } from '../support/xlsx.js';

const app = useTestApp();
let author: AdminActor;
let reviewer: AdminActor;
let professional: Record<string, string>;

beforeAll(async () => {
  author = await adminActor(app, 'CALCULATOR_EDITOR');
  reviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  professional = (await userActor(app, 'PROFESSIONAL')).auth;
});

const header: TestCell[] = ['Médicament', 'Période', 'Statut', 'Alternative', 'Source'];
const sheet = (rows: TestCell[][]) => xlsx([header, ...rows]);
const upload = (admin: AdminActor, file: Buffer, name = 'grossesse.xlsx') =>
  admin.post('/admin/v1/pregnancy/imports').attach('file', file, name);

async function mapStatuses(id: string, revision: number, statuses: Record<string, string>) {
  await author
    .put(`/admin/v1/pregnancy/imports/${id}/mapping`)
    .send({ revision, statuses })
    .expect(204);
  return (await author.get(`/admin/v1/pregnancy/imports/${id}`).expect(200)).body;
}

describe('access and file checks', () => {
  it('lets only authors import, and refuses files that are not workbooks', async () => {
    await upload(reviewer, sheet([['A', 'T1', 'Valide', null, null]])).expect(403);
    const notXlsx = await upload(
      author,
      Buffer.from('Médicament;Période\nA;T1'),
      'faux.xlsx',
    ).expect(422);
    expect(notXlsx.body.error.code).toBe('UPLOAD_INVALID');
    await author.post('/admin/v1/pregnancy/imports').expect(422);
    const finance = await adminActor(app, 'FINANCE_ADMIN');
    await finance.get('/admin/v1/pregnancy/imports').expect(403);
  });
});

describe('import workflow', () => {
  const tag = randomUUID().slice(0, 6);
  const drug = `Ibupraxine ${tag}`;
  const other = `Paralotol ${tag}`;
  let batchId: string;
  let versionIds: string[];

  it('previews, needs every status word mapped, and reopens the same file instead of a copy', async () => {
    const file = sheet([
      [
        drug,
        '1er trimestre',
        'Non valide',
        other,
        { text: 'CRAT', link: `https://lecrat.fr/${tag}` },
      ],
      [drug, 'Allaitement', 'Valide', null, `https://example.org/${tag}`],
      [other, 'Toute la grossesse', 'Valide', null, null],
      [other, 'T2', 'Valide', null, null],
    ]);
    const first = await upload(author, file).expect(200);
    batchId = first.body.id;
    expect(first.body).toMatchObject({
      status: 'PREVIEW',
      sheetName: 'Feuil1',
      headerRow: 1,
      missingColumns: [],
    });
    expect(first.body.columns).toEqual({
      0: 'substance',
      1: 'period',
      2: 'status',
      3: 'alternative',
      4: 'sourceUrl',
    });
    expect(
      first.body.statuses.map((s: { sample: string; mappedTo: null }) => [s.sample, s.mappedTo]),
    ).toEqual([
      ['Valide', null],
      ['Non valide', null],
    ]);
    expect(first.body.summary).toMatchObject({ total: 4, valid: 0, duplicates: 2 });
    expect(first.body.rows[0].issues).toContainEqual(
      expect.objectContaining({ code: 'STATUS_UNMAPPED' }),
    );
    expect(first.body.rows[0].values.sourceTitle).toBe('CRAT');

    const again = await upload(author, file).expect(200);
    expect(again.body.id).toBe(batchId);

    // Nothing to commit while rows have errors.
    const refused = await author
      .post(`/admin/v1/pregnancy/imports/${batchId}/commit`)
      .send({ revision: first.body.revision, reason: 'Import du tableau' })
      .expect(409);
    expect(refused.body.error.code).toBe('INVALID_STATE');
  });

  it('is corrected row by row: mapping, exclusion, edits, all rechecked on the server', async () => {
    let view = (await author.get(`/admin/v1/pregnancy/imports/${batchId}`).expect(200)).body;
    view = await mapStatuses(batchId, view.revision, { valide: 'NONE', 'non valide': 'AVOID' });
    expect(view.statuses.every((s: { mappedTo: string | null }) => s.mappedTo !== null)).toBe(true);

    // « Toute la grossesse » and « T2 » collide on T2: exclude one, correct the other.
    const duplicates = (
      await author.get(`/admin/v1/pregnancy/imports/${batchId}?filter=DUPLICATE`).expect(200)
    ).body;
    expect(duplicates.rowsTotal).toBe(2);
    const t2 = duplicates.rows.find(
      (r: { values: { period: string } }) => r.values.period === 'T2',
    );
    await author
      .patch(`/admin/v1/pregnancy/imports/${batchId}/rows/${t2.id}`)
      .send({ revision: view.revision, excluded: true })
      .expect(204);
    // A stale revision is refused.
    await author
      .patch(`/admin/v1/pregnancy/imports/${batchId}/rows/${t2.id}`)
      .send({ revision: view.revision, excluded: false })
      .expect(409);
    view = (await author.get(`/admin/v1/pregnancy/imports/${batchId}`).expect(200)).body;
    const whole = view.rows.find(
      (r: { values: { period: string } }) => r.values.period === 'Toute la grossesse',
    );
    await author
      .patch(`/admin/v1/pregnancy/imports/${batchId}/rows/${whole.id}`)
      .send({ revision: view.revision, values: { period: 'T1, T3' } })
      .expect(204);
    view = (await author.get(`/admin/v1/pregnancy/imports/${batchId}`).expect(200)).body;
    expect(view.summary).toMatchObject({
      total: 4,
      excluded: 1,
      valid: 3,
      errors: 0,
      duplicates: 0,
      newSubstances: 2,
    });
    const edited = view.rows.find((r: { id: string }) => r.id === whole.id);
    expect(edited).toMatchObject({ edited: true, values: { period: 'T1, T3' } });
    expect(edited.original[1].text).toBe('Toute la grossesse');
  });

  it('commits drafts once, whatever the retries, and publishes nothing', async () => {
    const view = (await author.get(`/admin/v1/pregnancy/imports/${batchId}`).expect(200)).body;
    const [a, b] = await Promise.all([
      author
        .post(`/admin/v1/pregnancy/imports/${batchId}/commit`)
        .send({ revision: view.revision, reason: 'Import du tableau CRAT' }),
      author
        .post(`/admin/v1/pregnancy/imports/${batchId}/commit`)
        .send({ revision: view.revision, reason: 'Import du tableau CRAT' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    expect(a.body).toMatchObject({
      substancesCreated: 2,
      versionsCreated: 2,
      versionsUpdated: 0,
      sourcesCreated: 2,
      rowsWritten: 3,
    });
    versionIds = a.body.versionIds;

    const committed = (await author.get(`/admin/v1/pregnancy/imports/${batchId}`).expect(200)).body;
    expect(committed).toMatchObject({ status: 'COMMITTED', result: a.body });
    // The history is frozen.
    await author
      .patch(`/admin/v1/pregnancy/imports/${batchId}/rows/${committed.rows[0].id}`)
      .send({ revision: committed.revision, excluded: true })
      .expect(409);

    const versions = await Promise.all(
      versionIds.map((id) => author.get(`/admin/v1/pregnancy/versions/${id}`).expect(200)),
    );
    const ibu = versions.map((v) => v.body).find((v) => v.substance.nameFr === drug);
    expect(ibu.status).toBe('DRAFT');
    expect(ibu.content.pregnancy.periods.T1).toMatchObject({
      conduct: 'AVOID',
      reportedStatus: 'Non valide',
      evidence: { level: null },
      alternatives: [expect.any(String)],
    });
    expect(ibu.content.lactation).toMatchObject({ conduct: null, reportedStatus: 'Valide' });
    expect(ibu.sources.map((s: { url: string; title: string }) => [s.title, s.url])).toEqual(
      expect.arrayContaining([
        ['CRAT', `https://lecrat.fr/${tag}`],
        ['example.org', `https://example.org/${tag}`],
      ]),
    );
    expect(ibu.problems).toContain('pregnancy.periods.T1.evidence.level: required');

    // Not in the app: nothing was published.
    const search = await app
      .http()
      .get(`/v1/pregnancy/substances/search?q=${encodeURIComponent(tag)}`)
      .set(professional)
      .expect(200);
    expect(search.body.total).toBe(0);

    // The audit trail names the batch.
    const history = (await author.get('/admin/v1/pregnancy/imports').expect(200)).body;
    expect(history.items.find((i: { id: string }) => i.id === batchId)).toMatchObject({
      status: 'COMMITTED',
      rows: 4,
    });
  });

  it('reaches the app only after an author completes it and another person approves it', async () => {
    const ibu = (
      await Promise.all(versionIds.map((id) => author.get(`/admin/v1/pregnancy/versions/${id}`)))
    )
      .map((r) => r.body)
      .find((v) => v.substance.nameFr === drug);
    const complete = structuredClone(ibu.content);
    for (const key of ['T1', 'T2', 'T3', 'PERIPARTUM'] as const) {
      complete.pregnancy.periods[key] = {
        ...(complete.pregnancy.periods[key] ?? { conduct: null }),
        evidence: { level: 2 },
        ...(complete.pregnancy.periods[key]?.conduct
          ? { conductDetail: { fr: 'Éviter au premier trimestre.' } }
          : {}),
      };
    }
    complete.lactation = {
      ...complete.lactation,
      evidence: { level: 3 },
      conductText: { fr: "Compatible avec l'allaitement." },
    };
    await author
      .put(`/admin/v1/pregnancy/versions/${ibu.id}`)
      .send({ content: complete, sourceIds: ibu.sources.map((s: { id: string }) => s.id) })
      .expect(200);

    const submitted = await author
      .post('/admin/v1/pregnancy/versions/submit-many')
      .send({ versionIds, text: 'Relecture du lot importé' })
      .expect(200);
    // The other substance is still incomplete: reported, not submitted.
    expect(submitted.body.results).toEqual(
      expect.arrayContaining([
        { versionId: ibu.id, ok: true },
        expect.objectContaining({ ok: false, code: 'INVALID_STATE' }),
      ]),
    );
    await author
      .post('/admin/v1/pregnancy/versions/approve-many')
      .send({ versionIds: [ibu.id], text: 'Je valide' })
      .expect(403);
    const approved = await reviewer
      .post('/admin/v1/pregnancy/versions/approve-many')
      .send({ versionIds: [ibu.id], text: 'Relu avec les sources' })
      .expect(200);
    expect(approved.body.results).toEqual([{ versionId: ibu.id, ok: true }]);

    // Partial, accent- and case-insensitive search; periods stay separate.
    const hit = await app
      .http()
      .get(`/v1/pregnancy/substances/search?q=${encodeURIComponent(`IBUPRA ${tag}`)}`)
      .set(professional)
      .expect(200);
    expect(hit.body.total).toBe(1);
    expect(hit.body.items[0]).toMatchObject({
      nameFr: drug,
      access: { state: 'AVAILABLE' },
      periods: {
        T1: { conduct: 'AVOID', evidenceLevel: 2 },
        T2: { conduct: null, evidenceLevel: 2 },
        LACTATION: { conduct: null, evidenceLevel: 3 },
      },
    });

    // Archiving takes it out of the app.
    await reviewer
      .patch(`/admin/v1/pregnancy/substances/${ibu.substance.id}/visibility`)
      .send({ enabled: false, reason: 'Retiré de la bibliothèque' })
      .expect(200);
    const gone = await app
      .http()
      .get(`/v1/pregnancy/substances/search?q=${encodeURIComponent(tag)}`)
      .set(professional)
      .expect(200);
    expect(gone.body.total).toBe(0);
    const archived = await author
      .get(`/admin/v1/pregnancy/substances?archived=archived&q=${encodeURIComponent(tag)}`)
      .expect(200);
    expect(archived.body.map((s: { nameFr: string }) => s.nameFr)).toEqual([drug]);
  });
});

describe('safety at commit', () => {
  it('rechecks against the library inside the transaction and writes nothing when it fails', async () => {
    const tag = randomUUID().slice(0, 6);
    const shared = `Clashmab ${tag}`;
    const fresh = `Freshine ${tag}`;
    const preview = (
      await upload(
        author,
        sheet([
          [fresh, 'T1', 'Valide', null, null],
          [shared, 'T1', 'Valide', null, null],
        ]),
      ).expect(200)
    ).body;
    const view = await mapStatuses(preview.id, preview.revision, { valide: 'NONE' });
    expect(view.summary.errors).toBe(0);

    // Meanwhile another author opens a draft on one of the substances.
    const otherAuthor = await adminActor(app, 'CALCULATOR_EDITOR');
    const created = await otherAuthor
      .post('/admin/v1/pregnancy/substances')
      .send({ nameFr: shared, reason: 'Créée par un autre auteur' })
      .expect(200);
    await otherAuthor
      .post(`/admin/v1/pregnancy/substances/${created.body.id}/versions`)
      .send({ reason: 'Brouillon' })
      .expect(200);

    const refused = await author
      .post(`/admin/v1/pregnancy/imports/${preview.id}/commit`)
      .send({ revision: view.revision, reason: 'Import' })
      .expect(409);
    expect(refused.body.error.code).toBe('INVALID_STATE');
    const list = await author
      .get(`/admin/v1/pregnancy/substances?q=${encodeURIComponent(fresh)}`)
      .expect(200);
    expect(list.body).toEqual([]);
    expect(
      (await author.get(`/admin/v1/pregnancy/imports/${preview.id}`).expect(200)).body.status,
    ).toBe('PREVIEW');

    // The reason is visible on the row, and the batch can be dropped.
    const rows = (
      await author.get(`/admin/v1/pregnancy/imports/${preview.id}?filter=ERROR`).expect(200)
    ).body;
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].issues).toContainEqual(
      expect.objectContaining({ code: 'DRAFT_OF_ANOTHER_AUTHOR' }),
    );
    await author
      .post(`/admin/v1/pregnancy/imports/${preview.id}/discard`)
      .send({ reason: 'Conflit' })
      .expect(204);
    expect(
      (await author.get(`/admin/v1/pregnancy/imports/${preview.id}`).expect(200)).body.status,
    ).toBe('DISCARDED');
  });
});
