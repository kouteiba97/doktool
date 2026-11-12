// Completes an imported Medicalcul draft for publication, without writing clinical content:
//   - limits that only refuse impossible entries (a negative weight, more than 100 %);
//   - a limitations text that says where the format comes from and what the source does not state;
//   - test cases whose expected value is what Medicalcul's own page computes.
// Formulas, points, thresholds and band labels are left exactly as extracted.
import {
  type CalculatorDefinition,
  type CalculatorInput,
  type EvaluationInputs,
  evaluate,
} from '../../modules/calculators/index.js';
import type { ParsedPage } from './page.js';
import { ReferenceFailure, runReference } from './reference.js';

type NumericInput = Extract<CalculatorInput, { kind: 'NUMBER' | 'INTEGER' }>;

/** The placeholder the import writes; a definition that still has it is not publishable. */
export const LIMITATIONS_PLACEHOLDER = '[À COMPLÉTER]';

/** What replaces the placeholder: provenance, and what the source leaves unsaid. */
export const LIMITATIONS = {
  fr: 'Format de calcul repris de Medicalcul (Dr Ph. Mignard), avec son accord. Cette source ne précise pas les limites d’utilisation ni les populations exclues : se reporter aux références citées.',
  en: 'Calculation format taken from Medicalcul (Dr Ph. Mignard), with his agreement. This source does not state the limits of use or the excluded populations: refer to the cited references.',
};

/**
 * Entry limits by what is measured. They refuse values that cannot exist (and the slip of typing
 * metres for centimetres); they are not validated or plausible ranges, which stay empty until a
 * doctor sets them from the primary source.
 */
export function entryLimits(input: NumericInput): { min: number; max?: number } {
  const unit = input.canonicalUnit.trim().toLowerCase();
  const label = input.label.fr.trim().toLowerCase();
  if (unit === 'ans' || /^[aâ]ge\b/.test(label)) return { min: 0, max: 130 };
  if (unit === 'kg') return { min: 0.2, max: 700 };
  if (unit === 'cm' && /taille/.test(label)) return { min: 20, max: 300 };
  if (unit === '%') return { min: 0, max: 100 };
  // The page itself gives the scale of these answers: « (0=absent, 10=extrême) ».
  if (/^\(0\s*=.*10\s*=/.test(unit)) return { min: 0, max: 10 };
  return { min: 0 };
}

/** The draft with entry limits on its numeric inputs and the limitations text. */
export function completeDefinition(definition: CalculatorDefinition): CalculatorDefinition {
  return {
    ...definition,
    inputs: definition.inputs.map((input) =>
      (input.kind === 'NUMBER' || input.kind === 'INTEGER') && !input.hardRange
        ? { ...input, hardRange: entryLimits(input) }
        : input,
    ),
    limitations: definition.limitations.fr.startsWith(LIMITATIONS_PLACEHOLDER)
      ? LIMITATIONS
      : definition.limitations,
  };
}

/** A small deterministic generator, so a rerun writes the same test cases. */
function generator(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Values typed in a numeric field for the test cases: ordinary numbers inside its limits. */
function sampleValues(input: NumericInput): number[] {
  const unit = input.canonicalUnit.trim().toLowerCase();
  const limits = input.hardRange ?? entryLimits(input);
  const candidates =
    unit === 'ans'
      ? [45, 72, 30, 61]
      : unit === 'kg'
        ? [70, 54, 88, 63]
        : unit === 'cm'
          ? [170, 158, 182, 165]
          : unit === '%'
            ? [40, 60, 35, 50]
            : unit === 'mmhg'
              ? [120, 95, 140, 110]
              : [4, 7, 2, 9];
  return candidates.filter(
    (value) =>
      (limits.min === undefined || value >= limits.min) &&
      (limits.max === undefined || value <= limits.max),
  );
}

/**
 * Answers to try: the first answer everywhere, the last everywhere, then mixed picks. Enough to
 * exercise every branch of a point score more than once.
 */
export function candidateInputs(
  definition: CalculatorDefinition,
  seed: string,
  count = 12,
): EvaluationInputs[] {
  const random = generator(seed);
  const cases: EvaluationInputs[] = [];
  for (let index = 0; index < count; index++) {
    const inputs: EvaluationInputs = {};
    for (const input of definition.inputs) {
      const pick = (length: number) =>
        index === 0 ? 0 : index === 1 ? length - 1 : Math.floor(random() * length);
      if (input.kind === 'CHOICE') {
        inputs[input.key] = { value: input.choices[pick(input.choices.length)]!.value };
      } else if (input.kind === 'BOOLEAN') {
        inputs[input.key] = { value: pick(2) === 1 };
      } else {
        const samples = sampleValues(input);
        inputs[input.key] = { value: samples[pick(samples.length)]! };
      }
    }
    cases.push(inputs);
  }
  return cases;
}

/** A test case whose expected value was computed by Medicalcul's page. */
export interface ReferenceCase {
  inputs: EvaluationInputs;
  expectedValue: number;
  tolerance: number;
  expectedBand: string | null;
}

/** Why a calculator cannot be published from its source. */
export class NotVerifiable extends Error {}

/** The number Medicalcul shows as its result: the result field the definition was built from. */
function referenceValue(
  outputs: Map<string, { label: string; unit: string | null; value: string }>,
  definition: CalculatorDefinition,
): number {
  const written = [...outputs.values()];
  const named = written.filter(
    (output) => (output.label || 'Résultat') === definition.result.label.fr,
  );
  const pool = (named.length > 0 ? named : written).filter(
    (output) => output.value.trim() !== '' && Number.isFinite(Number(output.value)),
  );
  if (pool.length !== 1) return Number.NaN;
  return Number(pool[0]!.value);
}

/**
 * Compares DokTool's engine with Medicalcul's page on the candidate answers. Every answer set
 * where the page gives a number must give the same number in DokTool; one difference refuses the
 * calculator. Returns up to `keep` cases, with at least `minimum`.
 */
export function referenceCases(
  page: ParsedPage,
  sharedScript: string,
  definition: CalculatorDefinition,
  seed: string,
  { keep = 6, minimum = 3 } = {},
): ReferenceCase[] {
  const cases: ReferenceCase[] = [];
  const seen = new Set<string>();
  for (const inputs of candidateInputs(definition, seed)) {
    const signature = JSON.stringify(inputs);
    if (seen.has(signature)) continue;
    seen.add(signature);
    let reference: number;
    try {
      reference = referenceValue(
        runReference(page, sharedScript, definition, inputs).outputs,
        definition,
      );
    } catch (error) {
      if (error instanceof ReferenceFailure) throw new NotVerifiable(error.message);
      throw error;
    }
    const ours = evaluate(definition, inputs);
    if (!Number.isFinite(reference)) {
      // The page shows no number for these answers (a division by zero, say): DokTool must not
      // show one either.
      if (ours.outcome === 'RESULT')
        throw new NotVerifiable('DokTool gives a result where the page gives none');
      continue;
    }
    if (ours.outcome !== 'RESULT')
      throw new NotVerifiable(`the page gives ${reference}, DokTool gives no result`);
    const tolerance = Math.max(1e-9, Math.abs(reference) * 1e-9);
    if (Math.abs(ours.value - reference) > tolerance)
      throw new NotVerifiable(`the page gives ${reference}, DokTool gives ${ours.value}`);
    cases.push({
      inputs,
      expectedValue: reference,
      tolerance,
      expectedBand: ours.band?.code ?? null,
    });
  }
  if (cases.length < minimum)
    throw new NotVerifiable(`only ${cases.length} answer set(s) give a number on the page`);
  return cases.slice(0, keep);
}
