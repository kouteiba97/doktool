// Publishing imported Medicalcul drafts: the completion writes no clinical content, and a test
// case exists only where DokTool's engine gives the value the source page itself computes.
// Synthetic pages built like the real ones (no Medicalcul content in the repository).
import { describe, expect, it } from 'vitest';
import type { CalculatorDefinition } from '../../src/modules/calculators/engine/index.js';
import { buildEntry } from '../../src/scripts/medicalcul/catalogue.js';
import {
  completeDefinition,
  entryLimits,
  LIMITATIONS,
  NotVerifiable,
  referenceCases,
} from '../../src/scripts/medicalcul/complete.js';
import { parsePage } from '../../src/scripts/medicalcul/page.js';
import { runReference } from '../../src/scripts/medicalcul/reference.js';

/** A stand-in for the helper the real pages load from their shared script. */
const SHARED = `function f_GetRadioValue(name) {
  var list = document.getElementsByName(name);
  for (var i = 0; i < list.length; i++) if (list[i].checked) return list[i].value;
  return 0;
}`;

const page = (script: string, form: string) => `<!DOCTYPE html>
<html><head><title>Medicalcul - Test ~ Néphrologie</title>
<script type="text/javascript" src="_scripts.js"></script>
<script type="text/javascript">
function f_Calculer()
{
${script}
  try { MSSAndroidFunction.storeHistory("x", "y", "z", "Score:", 0); } catch (e) { }
}
</script></head>
<body><form name="Form"><table>${form}</table>
<p class="score_result">Score : <input name="Resultat" type="text" readonly="readonly"/> ml/mn</p>
</form><p class="score_ref">Références:<br/>Author A. A title. Journal 2001.</p></body></html>`;

const clearance = page(
  `var K = 1.23;
   if (document.Form.vFemme.checked) K = 1.04;
   var Creat = document.Form.vCreat.value * document.Form.vCrUnit.value;
   document.Form.Resultat.value = ((140 - document.Form.vAge.value * 1) * document.Form.vPoids.value * K) / Creat;`,
  `<tr><td><label for="vAge">Age :</label></td><td><input name="vAge" id="vAge" type="number"/> ans</td></tr>
   <tr><td><label for="vPoids">Poids :</label></td><td><input name="vPoids" id="vPoids" type="number"/> kg</td></tr>
   <tr><td></td><td><input name="vSexe" type="radio" id="vHomme" checked/><label for="vHomme"> Homme</label>
     <input name="vSexe" type="radio" id="vFemme"/><label for="vFemme"> Femme</label></td></tr>
   <tr><td><label for="vCreat">Créatininémie :</label></td><td><input name="vCreat" id="vCreat" type="number"/>
     <select name="vCrUnit" id="vCrUnit"><option value="1">µmol/l</option><option value="8.84">mg/l</option></select></td></tr>`,
);

/** The definition the extractor builds from a synthetic page. */
function drafted(html: string): CalculatorDefinition {
  const entry = buildEntry('test.html', Buffer.from(html), true);
  if (!entry.definition) throw new Error(`not translated: ${entry.logic.reasons.join('; ')}`);
  return entry.definition;
}

describe('completing an imported draft', () => {
  it('refuses impossible entries only, by what is measured', () => {
    const definition = completeDefinition(drafted(clearance));
    const limits = Object.fromEntries(
      definition.inputs.flatMap((input) =>
        input.kind === 'NUMBER' ? [[input.key, input.hardRange]] : [],
      ),
    );
    expect(limits).toEqual({
      vAge: { min: 0, max: 130 },
      vPoids: { min: 0.2, max: 700 },
      // A laboratory value read in the unit chosen next to it: only « not negative ».
      vCreat: { min: 0 },
    });
    // Validated and plausible ranges are clinical: they stay for a doctor to set.
    expect(definition.inputs.every((input) => !('validatedRange' in input))).toBe(true);
  });

  it('keeps the formula and replaces only the placeholder text', () => {
    const draft = drafted(clearance);
    const definition = completeDefinition(draft);
    expect(definition.formula).toEqual(draft.formula);
    expect(definition.interpretation).toEqual(draft.interpretation);
    expect(draft.limitations.fr).toContain('[À COMPLÉTER]');
    expect(definition.limitations).toEqual(LIMITATIONS);
    // Completing twice changes nothing, and limits a doctor already set are kept.
    expect(completeDefinition(definition)).toEqual(definition);
  });

  it('reads the scale the page states and the definition of a percentage', () => {
    const numeric = (canonicalUnit: string, label: string) =>
      entryLimits({
        kind: 'NUMBER',
        key: 'x',
        label: { fr: label, en: label },
        required: true,
        quantity: 'X',
        canonicalUnit,
        units: [],
        decimals: 2,
      });
    expect(numeric('%', 'FiO2')).toEqual({ min: 0, max: 100 });
    expect(numeric('(0=absent, 10=extrêm', 'Réponse')).toEqual({ min: 0, max: 10 });
    expect(numeric('cm', 'Taille')).toEqual({ min: 20, max: 300 });
    expect(numeric('mmol/l', 'Natrémie')).toEqual({ min: 0 });
  });
});

describe('test cases from the source page', () => {
  const definition = completeDefinition(drafted(clearance));

  it('runs the page’s own script on the answers given', () => {
    const { outputs } = runReference(parsePage(clearance), SHARED, definition, {
      vAge: { value: 60 },
      vPoids: { value: 70 },
      vSexe: { value: 'o2' },
      vCreat: { value: 10 },
      vCrUnit: { value: 'o2' },
    });
    expect(Number(outputs.get('Resultat')!.value)).toBeCloseTo((80 * 70 * 1.04) / 88.4, 12);
  });

  it('keeps answer sets where DokTool gives exactly the page’s value', () => {
    const cases = referenceCases(parsePage(clearance), SHARED, definition, 'clearance');
    expect(cases.length).toBeGreaterThanOrEqual(3);
    expect(new Set(cases.map((testCase) => testCase.expectedValue)).size).toBeGreaterThan(1);
    // Same seed, same cases: a rerun writes nothing different.
    expect(referenceCases(parsePage(clearance), SHARED, definition, 'clearance')).toEqual(cases);
  });

  it('refuses a calculator whose result differs from the page, however slightly', () => {
    const drifted: CalculatorDefinition = {
      ...definition,
      formula: { op: 'mul', args: [definition.formula, { num: 1.0001 }] },
    };
    expect(() => referenceCases(parsePage(clearance), SHARED, drifted, 'clearance')).toThrow(
      NotVerifiable,
    );
  });

  it('refuses a page whose script cannot be run', () => {
    const broken = clearance.replace('var K = 1.23;', 'var K = notDefinedAnywhere();');
    expect(() => referenceCases(parsePage(broken), SHARED, definition, 'clearance')).toThrow(
      NotVerifiable,
    );
  });
});
