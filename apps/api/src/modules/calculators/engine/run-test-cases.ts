import type { CalculatorDefinition } from './definition.js';
import { ENGINE_VERSION, type Evaluation, type EvaluationInputs, evaluate } from './evaluate.js';

export type ExpectedOutcome = 'RESULT' | 'INVALID' | 'OUT_OF_VALIDATED_RANGE';

/** A test case: inputs and the expected outcome, value (± tolerance) and band. */
export interface TestCaseSpec {
  id: string;
  inputs: EvaluationInputs;
  expectedOutcome: ExpectedOutcome;
  expectedValue: number | null;
  tolerance: number | null;
  expectedBand: string | null;
}

/** The outcome of one test case, with the reason when it fails. */
export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  expectedOutcome: ExpectedOutcome;
  actualOutcome: Evaluation['outcome'] | 'ERROR';
  expectedValue: number | null;
  actualValue: number | null;
  expectedBand: string | null;
  actualBand: string | null;
  /** Why the case failed, in plain words. */
  failure: string | null;
}

/** A full run of a version's test cases. */
export interface TestRun {
  passed: boolean;
  ranAt: string;
  engineVersion: string;
  total: number;
  failed: number;
  results: TestCaseResult[];
}

/** Runs a version's test cases on the authoritative engine (publication gate, admin "Lancer les tests"). */
export function runTestCases(
  definition: CalculatorDefinition,
  cases: TestCaseSpec[],
  now = new Date(),
): TestRun {
  const results = cases.map((testCase): TestCaseResult => {
    const base = {
      testCaseId: testCase.id,
      expectedOutcome: testCase.expectedOutcome,
      expectedValue: testCase.expectedValue,
      expectedBand: testCase.expectedBand,
    };
    let evaluation: Evaluation;
    try {
      evaluation = evaluate(definition, testCase.inputs);
    } catch (error) {
      return {
        ...base,
        passed: false,
        actualOutcome: 'ERROR',
        actualValue: null,
        actualBand: null,
        failure: `engine error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const actualValue = evaluation.outcome === 'RESULT' ? evaluation.value : null;
    const actualBand = evaluation.outcome === 'RESULT' ? (evaluation.band?.code ?? null) : null;
    let failure: string | null = null;
    if (evaluation.outcome !== testCase.expectedOutcome) {
      failure = `expected ${testCase.expectedOutcome}, got ${evaluation.outcome}`;
    } else if (evaluation.outcome === 'RESULT') {
      const tolerance = testCase.tolerance ?? 0;
      if (
        testCase.expectedValue === null ||
        Math.abs(evaluation.value - testCase.expectedValue) > tolerance
      ) {
        failure = `expected ${testCase.expectedValue} ± ${tolerance}, got ${evaluation.value}`;
      } else if (testCase.expectedBand !== null && actualBand !== testCase.expectedBand) {
        failure = `expected band ${testCase.expectedBand}, got ${actualBand ?? 'none'}`;
      }
    }
    return {
      ...base,
      passed: failure === null,
      actualOutcome: evaluation.outcome,
      actualValue,
      actualBand,
      failure,
    };
  });
  const failed = results.filter((result) => !result.passed).length;
  return {
    passed: results.length > 0 && failed === 0,
    ranAt: now.toISOString(),
    engineVersion: ENGINE_VERSION,
    total: results.length,
    failed,
    results,
  };
}
