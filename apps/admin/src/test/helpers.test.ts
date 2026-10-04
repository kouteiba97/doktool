import { describe, expect, it } from 'vitest';
import {
  currentRun,
  formulaText,
  rangeText,
  readDefinition,
} from '@/features/calculators/definition';
import { publicationGates, type Version } from '@/features/calculators/labels';
import { toEvaluationInputs } from '@/features/calculators/preview-panel';
import { pdfProblem, sha256Hex, suggestTitle } from '@/features/library/upload';
import { addTerm, MAX_SYNONYMS } from '@/features/search/synonyms-editor';
import {
  linesOf,
  parsePrice,
  planFormValues,
  planSchema,
  toPublishBody,
} from '@/features/subscriptions/plan-form';
import { waitingSince } from '@/features/verification/labels';
import { formatAge, formatMoney } from '@/i18n/format';
import { createTranslator } from '@/i18n/messages';
import { safeNext } from '@/session/session';
import { homeFor, isActive, NAVIGATION, visibleNavigation } from '@/shell/nav';

const definition = {
  schemaVersion: 1,
  inputs: [
    {
      kind: 'NUMBER',
      key: 'weight',
      label: { fr: 'Poids', en: 'Weight' },
      required: true,
      quantity: 'BODY_WEIGHT',
      canonicalUnit: 'kg',
      units: [{ code: 'lb', factorToCanonical: 0.45359237, source: 'NIST' }],
      validatedRange: { min: 30, max: 150 },
    },
    { kind: 'BOOLEAN', key: 'female', label: { fr: 'Femme', en: 'Female' }, required: true },
    {
      kind: 'CHOICE',
      key: 'level',
      label: { fr: 'Niveau', en: 'Level' },
      required: false,
      choices: [
        { value: 'LOW', label: { fr: 'Bas', en: 'Low' } },
        { value: 'HIGH', label: { fr: 'Haut', en: 'High' } },
      ],
    },
  ],
  formula: {
    op: 'round',
    digits: 1,
    args: [
      {
        op: 'mul',
        args: [
          { input: 'weight' },
          { op: 'if', args: [{ input: 'female' }, { num: 0.85 }, { num: 1 }] },
        ],
      },
    ],
  },
  result: { unit: 'mL/min', decimals: 1, label: { fr: 'Clairance', en: 'Clearance' } },
  limitations: { fr: 'Adulte uniquement.', en: 'Adults only.' },
};

describe('navigation', () => {
  it('shows only the sections the grants open, in the section 02 order', () => {
    const groups = visibleNavigation(['calculators.read', 'verification.queue.read']);
    expect(groups.map((group) => group.items.map((item) => item.href))).toEqual([
      ['/admin/overview'],
      ['/admin/verification', '/admin/recovery'],
      ['/admin/calculators'],
    ]);
    // The overview needs no grant: every admin lands there first.
    expect(homeFor([])).toBe('/admin/overview');
    expect(
      visibleNavigation(['finance.read']).flatMap((group) => group.items.map((item) => item.href)),
    ).toEqual(['/admin/overview', '/admin/finance']);
  });

  it('keeps the library item active on both type pages and calculators on detail pages', () => {
    const [library, calculators, pregnancy] = NAVIGATION.find(
      (group) => group.label === 'admin.nav.library',
    )!.items;
    expect(isActive(library!, '/admin/library/certificates')).toBe(true);
    expect(isActive(calculators!, '/admin/calculators/7f0c')).toBe(true);
    expect(isActive(calculators!, '/admin/calculatorsx')).toBe(false);
    expect(isActive(pregnancy!, '/admin/pregnancy/0199a1b2')).toBe(true);
  });

  it('never redirects outside the console after sign-in', () => {
    expect(safeNext('/admin/verification?x=1')).toBe('/admin/verification?x=1');
    expect(safeNext('//evil.example/admin')).toBe('/admin');
    expect(safeNext('https://evil.example')).toBe('/admin');
    expect(safeNext('/admin/v1/me')).toBe('/admin');
    expect(safeNext(null)).toBe('/admin');
  });
});

describe('catalogue', () => {
  it('formats admin messages in both languages', () => {
    expect(createTranslator('fr')('admin.plans.durationDays', { days: 30 })).toBe('30 jours');
    expect(createTranslator('en')('admin.calculators.versionTitle', { version: 3 })).toBe(
      'Version 3',
    );
    expect(createTranslator('en')('admin.calculators.caseInputsHelp')).toContain('{ "value"');
  });

  it('formats ages and prices per language', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    expect(formatAge('en', '2026-09-26T11:15:00Z', now)).toBe('45 min');
    expect(formatAge('fr', '2026-09-26T06:00:00Z', now)).toMatch(/^6\sh$/);
    expect(formatAge('fr', '2026-09-22T12:00:00Z', now)).toMatch(/^4\sj$/);
    expect(formatMoney('en', 150_000, 'DZD')).toContain('1,500.00');
  });
});

describe('verification', () => {
  it('waits since the appeal when there is one', () => {
    expect(waitingSince({ submittedAt: '2026-09-01', appealedAt: '2026-09-20' })).toBe(
      '2026-09-20',
    );
    expect(waitingSince({ submittedAt: '2026-09-01', appealedAt: null })).toBe('2026-09-01');
    expect(waitingSince({})).toBeNull();
  });
});

describe('calculator definitions', () => {
  it('renders the formula with input labels, in the mobile notation', () => {
    const view = readDefinition(definition);
    expect(view).not.toBeNull();
    const label = (key: string) => view!.inputs.find((input) => input.key === key)!.label.fr;
    expect(formulaText(view!.formula, label)).toBe('round((Poids × if(Femme, 0.85, 1)), 1)');
  });

  it('describes ranges and rejects definitions of another schema', () => {
    expect(rangeText({ min: 30, max: 150 })).toBe('[30 – 150]');
    expect(rangeText({ min: 18 })).toBe('≥ 18');
    expect(rangeText(undefined)).toBe('—');
    expect(readDefinition({ ...definition, schemaVersion: 2 })).toBeNull();
  });

  it('only trusts a test run of the current definition', () => {
    const run = {
      passed: true,
      ranAt: '2026-09-26T10:00:00Z',
      engineVersion: 'ts-1.0.0',
      total: 1,
      failed: 0,
      results: [],
      definitionSha256: 'abc',
    };
    expect(currentRun(run, 'abc')?.passed).toBe(true);
    expect(currentRun(run, 'def')).toBeNull();
    expect(currentRun(null, 'abc')).toBeNull();
  });

  it('lists the publication gate, including the unit source when units convert', () => {
    const version = {
      authoredBy: { id: 'author', fullName: 'A' },
      sources: [{ role: 'PRIMARY' }],
      testCases: [{ id: 't' }],
    } as unknown as Version;
    const gates = publicationGates(version, readDefinition(definition), null, 'reviewer');
    expect(gates.map((gate) => [gate.label, gate.ok])).toEqual([
      ['admin.calculators.gatePrimary', true],
      ['admin.calculators.gateUnitSource', false],
      ['admin.calculators.gateTestCases', true],
      ['admin.calculators.gateTestsPass', false],
      ['admin.calculators.gateReviewer', true],
    ]);
    expect(publicationGates(version, null, null, 'author').at(-1)?.ok).toBe(false);
  });

  it('sends preview inputs in the API format, leaving blanks out', () => {
    const view = readDefinition(definition)!;
    expect(
      toEvaluationInputs(view.inputs, {
        weight: { value: '72,5', unit: 'lb' },
        female: { value: 'true', unit: '' },
        level: { value: '', unit: '' },
      }),
    ).toEqual({ weight: { value: 72.5, unit: 'lb' }, female: { value: true } });
  });
});

describe('reference library uploads', () => {
  it('accepts one PDF of at most 20 MB', () => {
    expect(pdfProblem({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull();
    expect(pdfProblem({ name: 'a.pdf', type: '', size: 10 })).toBeNull();
    expect(pdfProblem({ name: 'a.docx', type: 'application/msword', size: 10 })).toBe('type');
    expect(pdfProblem({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toBe('empty');
    expect(pdfProblem({ name: 'a.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 })).toBe(
      'size',
    );
  });

  it('suggests the title as the API does', () => {
    expect(suggestTitle('C:\\docs\\angine_adulte-v2.pdf')).toBe('angine adulte v2');
    expect(suggestTitle('certificat   repos.PDF')).toBe('certificat repos');
  });

  it('declares the SHA-256 of the file', async () => {
    const hash = await sha256Hex(new Blob(['abc']));
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('search synonyms', () => {
  it('adds trimmed, unique terms up to the limit', () => {
    expect(addTerm(['IRC'], '  insuffisance   rénale ')).toEqual(['IRC', 'insuffisance rénale']);
    expect(addTerm(['IRC'], 'irc')).toEqual(['IRC']);
    expect(addTerm(['IRC'], '   ')).toEqual(['IRC']);
    const full = Array.from({ length: MAX_SYNONYMS }, (_, index) => `t${index}`);
    expect(addTerm(full, 'more')).toHaveLength(MAX_SYNONYMS);
    expect(addTerm([], 'x'.repeat(81))).toEqual([]);
  });
});

describe('plans', () => {
  it('reads prices in dinars with a comma or a point', () => {
    expect(parsePrice('1500')).toBe(150_000);
    expect(parsePrice('1 500,50')).toBe(150_050);
    expect(parsePrice('1500.5')).toBe(150_050);
    expect(parsePrice('15,555')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
  });

  it('turns the form into a plan version for the API', () => {
    const parsed = planSchema.parse({
      ...planFormValues(null),
      code: 'PRO_MONTHLY',
      nameFr: 'Pro mensuel',
      nameEn: 'Pro monthly',
      resident: false,
      price: '1500',
      durationDays: '30',
      includesFr: 'Ordonnances\n\n Certificats ',
      reason: 'Lancement des offres',
    });
    const body = toPublishBody(parsed);
    expect(body.audience).toEqual(['DOCTOR']);
    expect(body.priceMinor).toBe(150_000);
    expect(body.durationDays).toBe(30);
    expect(body.includesFr).toEqual(['Ordonnances', 'Certificats']);
    expect(linesOf('')).toEqual([]);
  });

  it('refuses a plan with no audience or below the minimum price', () => {
    const base = {
      ...planFormValues(null),
      code: 'PRO_A',
      nameFr: 'A',
      nameEn: 'A',
      durationDays: '30',
      reason: 'raison',
    };
    expect(
      planSchema.safeParse({ ...base, price: '1500', doctor: false, resident: false }).success,
    ).toBe(false);
    expect(planSchema.safeParse({ ...base, price: '10' }).success).toBe(false);
  });
});
