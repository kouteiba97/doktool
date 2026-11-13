// The Medicalcul extractor on synthetic pages built like the real ones (no Medicalcul content in
// the repository). An optional check runs on the real archive when MEDICALCUL_RAW points to it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/modules/calculators/engine/index.js';
import {
  buildCatalogue,
  buildEntry,
  type CatalogueSource,
  coverageCsv,
  slugFor,
} from '../../src/scripts/medicalcul/catalogue.js';
import { parsePage } from '../../src/scripts/medicalcul/page.js';

const page = (script: string, form: string, extra = '') => `<!DOCTYPE html>
<html><head><title>Medicalcul - Test score ~ Neurologie</title>
<script type="text/javascript" src="_scripts.js"></script>
<script type="text/javascript">
function f_Calculer()
{
${script}
  try { MSSAndroidFunction.storeHistory(f_GetFilename(), "x", "y", "Score:", 0); } catch (e) { }
}
</script></head>
<body class="scorebody"><p class="scoretitle_title">Test score<br/><img src="zzimgspe_neurologie.png"/></p>
<form name="Form" id="Form"><table class="score_table">${form}</table>
<p class="score_result">Score : <input name="Resultat" type="text" readonly="readonly"/></p>
${extra}
</form>
<p class="score_inter">Interprétation:<br/>Some prose.</p>
<p class="score_ref">Références:<br/>Author A. Title one. Journal 2001.<br/>Author B. Title two. 2005.</p>
</body></html>`;

const radios = (name: string, question: string, values: number[]) =>
  `<tr><td colspan="2"><strong>${question}</strong></td></tr>` +
  values
    .map(
      (value, index) =>
        `<tr><td><input name="${name}" id="${name}.${index}" type="radio" value="${value}"/></td>` +
        `<td><label for="${name}.${index}">${value} - option ${index}</label></td></tr>`,
    )
    .join('');

const entry = (html: string, file = 'test_score.html') => buildEntry(file, Buffer.from(html), true);

const pointsScore = page(
  `var Res = 0;
   for (var i = 1; i < 3; i++)
     Res += f_GetRadioValue('vItem' + i) * 1;
   document.Form.Resultat.value = Res;
   if (Res < 2) document.Form.Risque.value = "Low";
   if (Res > 1 && Res < 4) document.Form.Risque.value = "Medium";
   if (Res > 3) document.Form.Risque.value = "High";`,
  radios('vItem1', 'First question', [0, 1]) + radios('vItem2', 'Second question', [0, 1, 3]),
  '<p class="score_result">Risk : <input name="Risque" type="text" readonly="readonly"/></p>',
);

describe('Medicalcul page reader', () => {
  it('reads title, specialty, fields, headings and references', () => {
    const parsed = parsePage(pointsScore);
    expect(parsed.title).toBe('Test score');
    expect(parsed.specialty).toBe('neurologie');
    expect(parsed.specialtyLabel).toBe('Neurologie');
    expect(parsed.references).toEqual([
      'Author A. Title one. Journal 2001.',
      'Author B. Title two. 2005.',
    ]);
    const first = parsed.controls.find((c) => c.name === 'vItem1');
    expect(first).toMatchObject({
      kind: 'radio',
      heading: 'First question',
      label: '0 - option 0',
    });
    expect(parsed.controls.find((c) => c.name === 'Risque')).toMatchObject({
      kind: 'output',
      label: 'Risk',
    });
  });
});

describe('Medicalcul logic translation', () => {
  it('translates a points score with exact integer bands', () => {
    const result = entry(pointsScore);
    expect(result.logic.classification).toBe('STRUCTURED_CALCULATION_DEFINITION');
    const definition = result.definition!;
    expect(definition.inputs.map((i) => [i.kind, i.key, i.label.fr])).toEqual([
      ['CHOICE', 'vItem1', 'First question'],
      ['CHOICE', 'vItem2', 'Second question'],
    ]);
    expect(definition.formula).toEqual({
      op: 'sum',
      args: [{ points: 'vItem1' }, { points: 'vItem2' }],
    });
    expect(definition.result.decimals).toBe(0);
    expect(
      definition.interpretation.map(({ from, to, label }) => ({ from, to, label: label.fr })),
    ).toEqual([
      { from: undefined, to: 2, label: 'Risk : Low' },
      { from: 2, to: 4, label: 'Risk : Medium' },
      { from: 4, to: undefined, label: 'Risk : High' },
    ]);
    // Same answers, same score as the page: 1 + 3 = 4 → High.
    const evaluation = evaluate(definition, { vItem1: { value: 'o2' }, vItem2: { value: 'o3' } });
    expect(evaluation).toMatchObject({ outcome: 'RESULT', value: 4, band: { code: 'BAND_3' } });
    expect(result.import).toEqual({
      slug: 'test-score',
      nameFr: 'Test score',
      category: 'Neurologie',
    });
    expect(result.reviewNotes.join(' ')).toMatch(/primary source/);
  });

  it('reads f_GetRadioValue on a checkbox as its value when ticked, else 0', () => {
    const result = entry(
      page(
        `var Res = f_GetRadioValue('vA') * 1 + f_GetRadioValue('vB') * 1;
         document.Form.Resultat.value = Res;`,
        `<tr><td><input name="vA" id="vA" type="checkbox" value="2"/></td><td><label for="vA">Sign A</label></td></tr>
         <tr><td><input name="vB" id="vB" type="checkbox" value="1"/></td><td><label for="vB">Sign B</label></td></tr>`,
      ),
    );
    const definition = result.definition!;
    expect(definition.inputs.map((i) => i.kind)).toEqual(['BOOLEAN', 'BOOLEAN']);
    expect(evaluate(definition, { vA: { value: true }, vB: { value: false } })).toMatchObject({
      value: 2,
    });
    expect(evaluate(definition, { vA: { value: true }, vB: { value: true } })).toMatchObject({
      value: 3,
    });
  });

  it('resolves a radio reached by its id and number fields with their unit', () => {
    const result = entry(
      page(
        `var Res = document.Form.vWeight.value * 2;
         if (document.Form.vWoman.checked) Res = Res - 1;
         document.Form.Resultat.value = Res.toFixed(1);`,
        `<tr><td><label for="vWeight">Weight :</label></td><td><input name="vWeight" id="vWeight" type="number"/> kg</td></tr>
         <tr><td></td><td><input name="vSex" type="radio" id="vMan"/><label for="vMan">Man</label>
         <input name="vSex" type="radio" id="vWoman"/><label for="vWoman">Woman</label></td></tr>`,
      ),
    );
    const definition = result.definition!;
    expect(definition.inputs[0]).toMatchObject({
      kind: 'NUMBER',
      key: 'vWeight',
      canonicalUnit: 'kg',
      label: { fr: 'Weight' },
    });
    expect(definition.inputs[1]).toMatchObject({
      kind: 'CHOICE',
      key: 'vSex',
      label: { fr: 'Man / Woman' },
    });
    expect(definition.result.decimals).toBe(1);
    expect(
      evaluate(definition, { vWeight: { value: 10, unit: 'kg' }, vSex: { value: 'o2' } }),
    ).toMatchObject({ value: 19 });
    expect(
      evaluate(definition, { vWeight: { value: 10, unit: 'kg' }, vSex: { value: 'o1' } }),
    ).toMatchObject({ value: 20 });
  });

  it.each([
    [
      'a real-valued band that includes its upper bound',
      `var Res = Math.sqrt(document.Form.vX.value * 1);
       document.Form.Resultat.value = Res;
       if (Res <= 2.5) document.Form.Risque.value = "Low";
       if (Res > 2.5) document.Form.Risque.value = "High";`,
      /includes its upper bound/,
    ],
    [
      'Math.round',
      `document.Form.Resultat.value = Math.round(document.Form.vX.value * 1);`,
      /Math.round/,
    ],
    [
      'text concatenation of a field',
      `document.Form.Resultat.value = document.Form.vX.value + 1;`,
      /text concatenation/,
    ],
    [
      'two numeric results',
      `document.Form.Resultat.value = document.Form.vX.value * 1;
       document.Form.Risque.value = document.Form.vX.value * 2;`,
      /2 numeric results/,
    ],
    [
      'an early return',
      `if (document.Form.vX.value * 1 < 0) return;
       document.Form.Resultat.value = document.Form.vX.value * 1;`,
      /ReturnStatement/,
    ],
    ['a script that does not parse', `var = ;`, /does not parse/],
  ])('keeps %s out of the import with its reason', (_case, script, reason) => {
    const result = entry(
      page(
        script,
        `<tr><td><label for="vX">X</label></td><td><input name="vX" id="vX" type="number"/></td></tr>`,
        '<p class="score_result">Risk : <input name="Risque" type="text" readonly="readonly"/></p>',
      ),
    );
    expect(result.logic.classification).toBe('FORMULA_TEXT_AVAILABLE');
    expect(result.definition).toBeNull();
    expect(result.import).toBeNull();
    expect(result.logic.reasons.join(' ')).toMatch(reason);
  });

  it('classifies pages without calculation as metadata only', () => {
    expect(entry(page('', '')).logic).toMatchObject({
      classification: 'METADATA_ONLY',
      reasons: ['f_Calculer writes no result (reference table)'],
    });
    expect(entry('<html><body><p>not a calculator').logic).toMatchObject({
      classification: 'METADATA_ONLY',
      executableLogic: false,
    });
  });
});

describe('Medicalcul catalogue', () => {
  const source: CatalogueSource = {
    app: 'test',
    apk: { url: 'http://example.test/app.apk', sha256: '0'.repeat(64), bytes: 1 },
    servers: ['http://example.test/'],
    descriptor: {
      path: '_update.cvf',
      header: '#h#',
      dataVersion: '1',
      archive: 'a.zip',
      startPage: 'i.html',
    },
    archive: { sha256: '1'.repeat(64), bytes: 1, identicalOn: [], unavailableOn: [] },
    retrievedAt: '2026-10-23',
  };

  it('is deterministic whatever the file order, and refuses duplicate slugs', () => {
    const pages = [
      { file: 'test_score.html', bytes: Buffer.from(pointsScore) },
      { file: 'test-score.html', bytes: Buffer.from(pointsScore) },
      { file: 'empty.html', bytes: Buffer.from(page('', '')) },
    ];
    const a = buildCatalogue(source, pages, new Set(['test_score.html']));
    const b = buildCatalogue(source, [...pages].reverse(), new Set(['test_score.html']));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(coverageCsv(a)).toBe(coverageCsv(b));
    expect(a.counts).toMatchObject({ pages: 3, importable: 1, METADATA_ONLY: 1, indexed: 1 });
    const duplicate = a.calculators.find((c) => c.id === 'test_score')!;
    expect(duplicate.import).toBeNull();
    expect(duplicate.logic.reasons.join(' ')).toMatch(/also used by test-score/);
  });

  it('makes slugs DokTool accepts', () => {
    expect(slugFor('aclf_grades')).toBe('aclf-grades');
    expect(slugFor('CKD__epi')).toBe('ckd-epi');
  });
});

const raw = process.env.MEDICALCUL_RAW;
describe.skipIf(!raw || !existsSync(path.join(raw, 'abcd2.html')))('on the real archive', () => {
  it('translates ABCD² into five scored questions and three bands', () => {
    const result = buildEntry('abcd2.html', readFileSync(path.join(raw!, 'abcd2.html')), true);
    const definition = result.definition!;
    expect(definition.inputs).toHaveLength(5);
    expect(definition.inputs.every((input) => input.kind === 'CHOICE')).toBe(true);
    expect(definition.formula).toMatchObject({ op: 'sum' });
    expect(definition.interpretation.map(({ from, to }) => [from, to])).toEqual([
      [undefined, 4],
      [4, 6],
      [6, undefined],
    ]);
  });
});
