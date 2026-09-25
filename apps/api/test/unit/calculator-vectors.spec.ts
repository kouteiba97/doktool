// The TypeScript engine against the shared conformance vectors (packages/calculator-vectors).
// The Dart engine runs the same files (Phase 12); CI fails if either disagrees.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkDefinition,
  type Evaluation,
  type EvaluationInputs,
  evaluate,
} from '../../src/modules/calculators/engine/index.js';

interface VectorCase {
  name: string;
  inputs: EvaluationInputs;
  expected: {
    outcome: Evaluation['outcome'];
    value?: number;
    tolerance?: number;
    band?: string;
    issues?: string[];
    notes?: string[];
    conversions?: {
      input: string;
      from: { value: number; unit: string };
      to: { value: number; unit: string };
    }[];
  };
}

interface Suite {
  suite: string;
  groups: { name: string; description: string; definition: unknown; cases: VectorCase[] }[];
}

const directory = fileURLToPath(
  new URL('../../../../packages/calculator-vectors/vectors/', import.meta.url),
);
const suites = readdirSync(directory)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(`${directory}${file}`, 'utf8')) as Suite);

const issueKeys = (evaluation: Evaluation) =>
  evaluation.outcome === 'RESULT'
    ? []
    : evaluation.issues
        .map((issue) => [issue.code, issue.ruleId ?? issue.input].filter(Boolean).join(':'))
        .sort();

it('finds the vector suites', () => {
  expect(suites.map((suite) => suite.suite).sort()).toEqual([
    'choices-and-bands',
    'non-finite',
    'operators',
    'units',
    'validation',
  ]);
});

for (const suite of suites) {
  describe(suite.suite, () => {
    for (const group of suite.groups) {
      describe(group.name, () => {
        const checked = checkDefinition(group.definition);

        it('has a valid definition', () => {
          expect(checked).toMatchObject({ ok: true });
        });
        if (!checked.ok) return;

        it.each(group.cases.map((testCase) => [testCase.name, testCase] as const))(
          '%s',
          (_, testCase) => {
            const evaluation = evaluate(checked.definition, testCase.inputs);
            const { expected } = testCase;
            expect(evaluation.outcome).toBe(expected.outcome);

            if (evaluation.outcome === 'RESULT') {
              expect(Math.abs(evaluation.value - expected.value!)).toBeLessThanOrEqual(
                expected.tolerance ?? 0,
              );
              if (expected.band !== undefined) expect(evaluation.band?.code).toBe(expected.band);
              if (expected.notes !== undefined)
                expect(evaluation.notes.map((note) => note.input).sort()).toEqual(
                  [...expected.notes].sort(),
                );
            }
            if (expected.issues !== undefined)
              expect(issueKeys(evaluation)).toEqual([...expected.issues].sort());
            if (expected.conversions !== undefined) {
              expect(evaluation.conversions).toHaveLength(expected.conversions.length);
              expected.conversions.forEach((conversion, index) => {
                const actual = evaluation.conversions[index]!;
                expect(actual.input).toBe(conversion.input);
                expect(actual.from).toEqual(conversion.from);
                expect(actual.to.unit).toBe(conversion.to.unit);
                expect(Math.abs(actual.to.value - conversion.to.value)).toBeLessThanOrEqual(1e-12);
              });
            }
          },
        );
      });
    }
  });
}
