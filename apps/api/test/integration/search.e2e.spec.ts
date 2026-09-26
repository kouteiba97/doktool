// Phase 10 search: one index over reference models and calculators, bilingual, typo tolerant,
// locked items kept in place, synonyms managed by admins.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AdminActor, adminActor, demoActor, userActor } from './actors.js';
import { useTestApp } from './app.js';
import { publishCalculator, publishReference } from './content.js';

const app = useTestApp();
let superAdmin: AdminActor;
let reviewer: AdminActor;
/** A word no other test uses, so results are this file's fixtures only. */
const word = `zorblax${randomUUID().slice(0, 6)}`;
let certificateId: string;
let calculatorId: string;

type Group = {
  type: string;
  total: number;
  hits: { id: string; titleFr: string; access: { state: string } }[];
};

beforeAll(async () => {
  superAdmin = await adminActor(app);
  reviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  await publishReference(app, superAdmin, {
    titleFr: `Angine ${word}`,
    titleEn: `Sore throat ${word}`,
  });
  certificateId = await publishReference(app, superAdmin, {
    titleFr: `Arrêt de travail ${word}`,
    type: 'CERTIFICATE',
    demoSample: true,
  });
  calculatorId = (
    await publishCalculator(superAdmin, reviewer, {
      nameFr: `Surface ${word}`,
      nameEn: `Area ${word}`,
      purposeFr: 'Estime une surface de test',
    })
  ).id;
});

const search = async (auth: Record<string, string>, q: string, type?: string) =>
  (
    await app
      .http()
      .get('/v1/search')
      .query({ q, ...(type ? { type } : {}) })
      .set(auth)
      .expect(200)
  ).body as { groups: Group[]; suggestions: string[] };

describe('search', () => {
  it('groups models and calculators, in either language, with typos', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL');
    const all = await search(auth, word);
    expect(all.groups.map((group) => [group.type, group.total])).toEqual(
      expect.arrayContaining([
        ['ORDONNANCE', 1],
        ['CERTIFICATE', 1],
        ['CALCULATOR', 1],
      ]),
    );
    expect((await search(auth, `sore ${word}`)).groups[0]?.hits[0]?.titleFr).toBe(`Angine ${word}`);
    const typo = `${word.slice(0, 2)}${word[3]}${word[2]}${word.slice(4)}`;
    expect((await search(auth, typo)).groups.length).toBe(3);
    const calculators = await search(auth, word, 'CALCULATOR');
    expect(calculators.groups.map((group) => group.type)).toEqual(['CALCULATOR']);
  });

  it('puts the group a query names first', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL');
    const result = await search(auth, `certificat ${word}`);
    expect(result.groups[0]?.type).toBe('CERTIFICATE');
  });

  it('keeps locked items in place for students and the demo', async () => {
    const student = await userActor(app, 'STUDENT');
    const forStudent = await search(student.auth, word);
    const ordonnance = forStudent.groups.find((group) => group.type === 'ORDONNANCE')!;
    expect(ordonnance.hits[0]?.access.state).toBe('LOCKED');
    const demo = await demoActor(app);
    const forDemo = await search(demo.auth, word);
    const certificate = forDemo.groups.find((group) => group.type === 'CERTIFICATE')!;
    expect(certificate.hits[0]).toMatchObject({
      id: certificateId,
      access: { state: 'AVAILABLE' },
    });
  });

  it('suggests titles when nothing matched', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL');
    const result = await search(auth, `${word}qq`.replace(word.slice(1, 2), ''));
    expect(result.groups).toEqual([]);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('needs a token and a query', async () => {
    await app.http().get('/v1/search').query({ q: word }).expect(401);
    const { auth } = await userActor(app, 'STUDENT');
    await app.http().get('/v1/search').set(auth).expect(400);
  });
});

describe('synonyms', () => {
  it('are managed per entity with the matching grant, audited, and searched', async () => {
    const synonym = `glorp${randomUUID().slice(0, 6)}`;
    const saved = await superAdmin
      .put(`/admin/v1/search/synonyms/${calculatorId}`)
      .query({ entityType: 'CALCULATOR' })
      .send({ terms: [synonym, ` ${synonym.toUpperCase()} `, 'Aire'], reason: 'Lay terms' })
      .expect(200);
    expect(saved.body.terms).toEqual(['Aire', synonym]);
    const listed = await superAdmin
      .get(`/admin/v1/search/synonyms/${calculatorId}`)
      .query({ entityType: 'CALCULATOR' })
      .expect(200);
    expect(listed.body.terms).toEqual(['Aire', synonym]);

    const { auth } = await userActor(app, 'PROFESSIONAL');
    const result = await search(auth, synonym);
    expect(result.groups[0]?.hits[0]?.id).toBe(calculatorId);

    const library = await adminActor(app, 'LIBRARY_MANAGER');
    await library
      .put(`/admin/v1/search/synonyms/${calculatorId}`)
      .query({ entityType: 'CALCULATOR' })
      .send({ terms: ['x'], reason: 'Not allowed' })
      .expect(403);
    const entries = await app.prisma().auditLogEntry.count({
      where: { entityId: calculatorId, action: 'search.synonyms_replaced' },
    });
    expect(entries).toBe(1);
  });
});
