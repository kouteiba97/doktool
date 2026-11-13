// ADR-025: the spreadsheet import rules, on real (generated) .xlsx files and pure row checks.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyRows } from '../../src/modules/pregnancy/import/apply.js';
import {
  checkRows,
  detectColumns,
  findHeaderRow,
  type LibrarySubstance,
  libraryOf,
  missingColumns,
  parsePeriod,
  parseUrl,
  type RowInput,
  type RowValues,
  splitAlternatives,
  summarise,
  valuesOf,
} from '../../src/modules/pregnancy/import/rows.js';
import { readWorkbook } from '../../src/modules/pregnancy/import/workbook.js';
import {
  EMPTY_CONTENT,
  type ProfileContent,
  profileContentSchema,
  reviewProblems,
} from '../../src/modules/pregnancy/pregnancy.content.js';
import { xlsx } from '../support/xlsx.js';

const values = (overrides: Partial<RowValues> = {}): RowValues => ({
  substance: 'Ibuprofène',
  context: null,
  period: 'T1',
  status: 'Non valide',
  alternative: null,
  sourceUrl: 'https://lecrat.fr/ibuprofene',
  sourceTitle: null,
  ...overrides,
});
let n = 0;
const row = (overrides: Partial<RowValues> = {}, extra: Partial<RowInput> = {}): RowInput => ({
  id: `r${++n}`,
  rowNumber: n + 1,
  values: values(overrides),
  original: [],
  excluded: false,
  resolution: null,
  ...extra,
});
const mapping = { 'non valide': 'AVOID', valide: 'NONE' } as const;
const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);
const empty = libraryOf([]);

describe('workbook reading', () => {
  it('reads cells by position, hyperlink targets and HYPERLINK() formulas, never evaluating them', async () => {
    const workbook = await readWorkbook(
      xlsx([
        [null, null, null],
        ['Médicament', 'Période', 'Source'],
        ['Ibuprofène', 'T1', { text: 'CRAT', link: 'https://lecrat.fr/ibu' }],
        [
          'Paracétamol',
          'T2',
          { formula: 'HYPERLINK("https://example.org/p","Ref")', value: 'Ref' },
        ],
      ]),
    );
    expect(workbook.sheetName).toBe('Feuil1');
    expect(findHeaderRow(workbook.rows)).toBe(1);
    expect(workbook.rows[2]![2]).toEqual({
      text: 'CRAT',
      hyperlink: 'https://lecrat.fr/ibu',
      formula: false,
    });
    expect(workbook.rows[3]![2]).toEqual({
      text: 'Ref',
      hyperlink: 'https://example.org/p',
      formula: true,
    });
  });

  it.each([
    ['an empty file', Buffer.alloc(0), /empty/],
    ['a file that is not a zip', Buffer.from('Médicament;Période\nIbuprofène;T1'), /not an \.xlsx/],
    ['a zip without a workbook', Buffer.from(zipSync({ 'a.txt': strToU8('x') })), /no workbook/],
    [
      'a file over 5 MB',
      Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(5 * 1024 * 1024)]),
      /5 MB/,
    ],
  ])('refuses %s', async (_name, buffer, message) => {
    await expect(readWorkbook(buffer)).rejects.toMatchObject({
      code: 'UPLOAD_INVALID',
      message: expect.stringMatching(message),
    });
  });

  it('refuses a part that expands beyond the limit (zip bomb)', async () => {
    const bomb = xlsx([['a', 'b']], {
      extraParts: { 'xl/sharedStrings.xml': ' '.repeat(21 * 1024 * 1024) },
    });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(readWorkbook(bomb)).rejects.toMatchObject({
      message: expect.stringMatching(/expands/),
    });
  });

  it('refuses a workbook without data', async () => {
    await expect(readWorkbook(xlsx([]))).rejects.toMatchObject({
      message: expect.stringMatching(/no sheet with data/),
    });
  });
});

describe('columns', () => {
  it('recognises French and English headers, whatever their order and accents', () => {
    const headers = [
      'Lien source',
      'Période',
      'DCI',
      'Statut',
      'Générique proposé',
      'Contexte',
      'Titre de la source',
    ];
    expect(detectColumns(headers)).toEqual({
      0: 'sourceUrl',
      1: 'period',
      2: 'substance',
      3: 'status',
      4: 'alternative',
      5: 'context',
      6: 'sourceTitle',
    });
    expect(missingColumns(detectColumns(['Médicament', 'Commentaire']))).toEqual([
      'period',
      'status',
    ]);
  });

  it('takes the hyperlink as the source and its text as the title', () => {
    const cells = [
      { text: 'Ibuprofène', hyperlink: null, formula: false },
      { text: 'CRAT', hyperlink: 'https://lecrat.fr/ibu', formula: false },
    ];
    expect(valuesOf(cells, { 0: 'substance', 1: 'sourceUrl' })).toMatchObject({
      substance: 'Ibuprofène',
      sourceUrl: 'https://lecrat.fr/ibu',
      sourceTitle: 'CRAT',
    });
  });
});

describe('cell meaning', () => {
  it.each([
    ['T1', ['T1']],
    ['1er trimestre', ['T1']],
    ['2ème trimestre', ['T2']],
    ['Troisième trimestre', ['T3']],
    ['Péri-partum', ['PERIPARTUM']],
    ['T1, T2', ['T1', 'T2']],
    ['T1 et T3', ['T1', 'T3']],
    ['Toute la grossesse', ['T1', 'T2', 'T3', 'PERIPARTUM']],
    ['Allaitement', ['LACTATION']],
  ])('reads « %s »', (text, targets) => {
    expect(parsePeriod(text)).toEqual({ targets });
  });

  it.each(['< 24 SA', 'Grossesse', 'post-partum', 'T1-T3', 'fin de grossesse'])(
    'never guesses « %s »',
    (text) => {
      expect(parsePeriod(text)).toEqual({ error: 'PERIOD_UNKNOWN' });
    },
  );

  it('accepts only http(s) links without credentials', () => {
    expect(parseUrl('https://lecrat.fr/a?b=1')).toEqual({
      url: 'https://lecrat.fr/a?b=1',
      host: 'lecrat.fr',
    });
    expect(parseUrl('javascript:alert(1)')).toEqual({ error: 'URL_SCHEME' });
    expect(parseUrl('https://user:pw@lecrat.fr')).toEqual({ error: 'URL_CREDENTIALS' });
    expect(parseUrl('lecrat')).toEqual({ error: 'URL_INVALID' });
    expect(parseUrl('  ')).toBeNull();
    expect(splitAlternatives('Paracétamol ; Amoxicilline, acide clavulanique')).toEqual([
      'Paracétamol',
      'Amoxicilline, acide clavulanique',
    ]);
  });
});

const published = (conduct: 'AVOID' | null, reportedStatus?: string): ProfileContent => ({
  pregnancy: {
    periods: {
      T1: {
        conduct,
        ...(reportedStatus ? { reportedStatus } : {}),
        evidence: { level: 2 },
        conductDetail: { fr: 'Texte écrit par un auteur.' },
      },
      T2: null,
      T3: null,
      PERIPARTUM: null,
    },
    alternatives: [],
  },
  lactation: null,
});
const substance = (overrides: Partial<LibrarySubstance> = {}): LibrarySubstance => ({
  id: 'sub-ibu',
  nameFr: 'Ibuprofène',
  names: ['Ibuprofène', 'Advil'],
  open: null,
  published: null,
  ...overrides,
});

describe('row checks', () => {
  it('passes a complete row and plans it', () => {
    const [checked] = checkRows([row()], mapping, empty, 'author');
    expect(checked!.plan).toMatchObject({
      targets: ['T1'],
      conduct: 'AVOID',
      reportedStatus: 'Non valide',
    });
    expect(codes(checked!.issues)).toEqual(['SUBSTANCE_NEW', 'SOURCE_UNVERIFIED']);
  });

  it.each([
    ['a missing drug name', { substance: null }, 'SUBSTANCE_MISSING'],
    ['a missing period', { period: null }, 'PERIOD_MISSING'],
    ['an ambiguous period', { period: '< 24 SA' }, 'PERIOD_UNKNOWN'],
    ['a missing status', { status: null }, 'STATUS_MISSING'],
    ['a status word nobody mapped', { status: 'Déconseillé' }, 'STATUS_UNMAPPED'],
    ['a malformed link', { sourceUrl: 'ftp://lecrat.fr' }, 'URL_SCHEME'],
    [
      'a context that contradicts the period',
      { context: 'Allaitement', period: 'T1' },
      'CONTEXT_PERIOD_MISMATCH',
    ],
    ['an unknown context', { context: 'Néonatal' }, 'CONTEXT_UNKNOWN'],
    ['a drug proposed as its own alternative', { alternative: 'ibuprofene' }, 'ALTERNATIVE_SELF'],
  ])('blocks %s', (_name, overrides, code) => {
    const [checked] = checkRows([row(overrides)], mapping, empty, 'author');
    expect(checked!.plan).toBeNull();
    expect(checked!.issues).toContainEqual(expect.objectContaining({ code, severity: 'ERROR' }));
  });

  it('warns, without blocking, for a missing source and an unresolved alternative', () => {
    const [checked] = checkRows(
      [row({ sourceUrl: null, alternative: 'Inconnu-X' })],
      mapping,
      empty,
      'author',
    );
    expect(checked!.plan).not.toBeNull();
    expect(checked!.issues.filter((i) => i.severity === 'WARNING').map((i) => i.code)).toEqual([
      'SOURCE_MISSING',
      'ALTERNATIVE_UNRESOLVED',
    ]);
  });

  it('flags duplicate drug + period rows inside the file, but not once one is excluded', () => {
    const a = row({ substance: 'Ibuprofène', period: 'T1' });
    const b = row({ substance: ' ibuprofene ', period: 'T1, T2' });
    const checked = checkRows([a, b], mapping, empty, 'author');
    expect(checked.map((c) => c.plan)).toEqual([null, null]);
    expect(checked[0]!.issues).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_ROW', params: { row: b.rowNumber } }),
    );
    const kept = checkRows([a, { ...b, excluded: true }], mapping, empty, 'author');
    expect(kept[0]!.plan).not.toBeNull();
    expect(summarise([a, { ...b, excluded: true }], kept)).toMatchObject({
      total: 2,
      excluded: 1,
      valid: 1,
      duplicates: 0,
    });
  });

  it('matches a library drug by exact name or synonym only, and refuses an ambiguous one', () => {
    const library = libraryOf([substance()]);
    const [bySynonym] = checkRows([row({ substance: 'advil' })], mapping, library, 'author');
    expect(bySynonym!.plan!.existing!.id).toBe('sub-ibu');
    const [similar] = checkRows([row({ substance: 'Ibuprofen' })], mapping, library, 'author');
    expect(similar!.plan!.existing).toBeNull();
    const twins = libraryOf([
      substance(),
      substance({ id: 'sub-2', nameFr: 'Advil (autre)', names: ['Advil'] }),
    ]);
    const [ambiguous] = checkRows([row({ substance: 'Advil' })], mapping, twins, 'author');
    expect(ambiguous!.issues).toContainEqual(
      expect.objectContaining({ code: 'SUBSTANCE_AMBIGUOUS' }),
    );
  });

  it('requires an explicit choice when the library already says something else for that period', () => {
    const library = libraryOf([substance({ published: published(null, 'Valide') })]);
    const [unresolved] = checkRows([row()], mapping, library, 'author');
    expect(unresolved!.issues).toContainEqual(
      expect.objectContaining({ code: 'CONFLICT_UNRESOLVED', severity: 'ERROR' }),
    );
    const [update] = checkRows([row({}, { resolution: 'UPDATE' })], mapping, library, 'author');
    expect(update!.plan!.skip).toBe(false);
    const [keep] = checkRows([row({}, { resolution: 'SKIP' })], mapping, library, 'author');
    expect(keep!.plan!.skip).toBe(true);
    // Identical information is no conflict.
    const same = libraryOf([substance({ published: published('AVOID', 'Non valide') })]);
    expect(codes(checkRows([row()], mapping, same, 'author')[0]!.issues)).not.toContain(
      'CONFLICT_UNRESOLVED',
    );
  });

  it("never touches a version in review or another author's draft", () => {
    const open = (status: string, authoredById: string) =>
      libraryOf([substance({ open: { id: 'v', status, authoredById, content: EMPTY_CONTENT } })]);
    expect(
      codes(checkRows([row()], mapping, open('IN_REVIEW', 'author'), 'author')[0]!.issues),
    ).toContain('VERSION_IN_REVIEW');
    expect(
      codes(checkRows([row()], mapping, open('DRAFT', 'someone'), 'author')[0]!.issues),
    ).toContain('DRAFT_OF_ANOTHER_AUTHOR');
    expect(checkRows([row()], mapping, open('DRAFT', 'author'), 'author')[0]!.plan).not.toBeNull();
  });
});

const SRC_A = '00000000-0000-4000-8000-00000000000a';
const SRC_B = '00000000-0000-4000-8000-00000000000b';
const PARA = '00000000-0000-4000-8000-0000000000aa';

describe('writing rows into a draft', () => {
  it('fills only what the sheet says, keeps what an author wrote, and never invents a level', () => {
    const library = libraryOf([substance({ published: published(null, 'Valide') })]);
    const rows = [
      row({}, { resolution: 'UPDATE' }),
      row({
        period: 'Allaitement',
        status: 'Valide',
        alternative: 'Paracétamol ; Inconnu-X',
        sourceUrl: 'https://e.org/l',
      }),
    ];
    const checked = checkRows(rows, mapping, library, 'author');
    const content = applyRows(
      published(null, 'Valide'),
      checked.map((c) => c.plan!),
      {
        sourceId: (url) => (url.includes('lecrat') ? SRC_A : SRC_B),
        substanceId: (key) => (key === 'paracetamol' ? PARA : null),
      },
    );
    expect(profileContentSchema.safeParse(content).success).toBe(true);
    expect(content.pregnancy!.periods.T1).toEqual({
      conduct: 'AVOID',
      reportedStatus: 'Non valide',
      evidence: { level: 2 },
      conductDetail: { fr: 'Texte écrit par un auteur.' },
      sourceIds: [SRC_A],
    });
    expect(content.pregnancy!.periods.T2).toBeNull();
    expect(content.lactation).toEqual({
      conduct: null,
      reportedStatus: 'Valide',
      evidence: { level: null },
      alternatives: [PARA],
      sourceIds: [SRC_B],
      unresolvedAlternatives: ['Inconnu-X'],
    });
  });

  it('keeps an imported draft out of review until a person completes it', () => {
    const content = applyRows(
      EMPTY_CONTENT,
      checkRows([row({ alternative: 'Inconnu-X' })], mapping, empty, 'a').map((c) => c.plan!),
      {
        sourceId: () => '00000000-0000-4000-8000-000000000001',
        substanceId: () => null,
      },
    );
    const problems = reviewProblems(content, {
      substanceId: 's',
      sourceIds: ['00000000-0000-4000-8000-000000000001'],
      knownSubstanceIds: new Set(),
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'pregnancy.periods.T1.evidence.level: required',
        'pregnancy.periods.T1.conductDetail: explain the conduct in one sentence',
        'pregnancy.periods.T1.unresolvedAlternatives: link « Inconnu-X » to a substance or remove it',
        'pregnancy.periods.T2: required',
        'lactation: the lactation block is required',
      ]),
    );
  });
});
