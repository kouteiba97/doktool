import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  checkDefinition,
  definitionSha256,
  roundHalfAwayFromZero,
  runTestCases,
} from '../../src/modules/calculators/engine/index.js';

const t = (text: string) => ({ fr: text, en: text });
const numberInput = (key: string, extra: Record<string, unknown> = {}) => ({
  kind: 'NUMBER',
  key,
  label: t(key),
  required: true,
  quantity: 'ABSTRACT',
  canonicalUnit: '1',
  ...extra,
});
const base = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  inputs: [
    numberInput('a'),
    {
      kind: 'CHOICE',
      key: 'c',
      label: t('c'),
      required: true,
      choices: [
        { value: 'X', label: t('X') },
        { value: 'Y', label: t('Y') },
      ],
    },
  ],
  formula: { input: 'a' },
  result: { unit: '1', decimals: 1, label: t('r') },
  limitations: t('none'),
  ...overrides,
});

const problemsOf = (definition: unknown) => {
  const result = checkDefinition(definition);
  return result.ok ? [] : result.problems.map((problem) => problem.message);
};

describe('checkDefinition', () => {
  it('accepts a well-formed definition and fills defaults', () => {
    const result = checkDefinition(base());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.definition.crossFieldRules).toEqual([]);
      expect(result.definition.interpretation).toEqual([]);
    }
  });

  it.each([
    ['unknown input', { formula: { input: 'nope' } }, /unknown input "nope"/],
    [
      'formula of the wrong type',
      { formula: { op: 'gt', args: [{ input: 'a' }, { num: 1 }] } },
      /must produce a number/,
    ],
    [
      'mixed operand types',
      { formula: { op: 'add', args: [{ input: 'a' }, { input: 'c' }] } },
      /needs number operands/,
    ],
    [
      'undeclared choice literal',
      {
        formula: {
          op: 'if',
          args: [{ op: 'eq', args: [{ input: 'c' }, { str: 'Z' }] }, { num: 1 }, { num: 0 }],
        },
      },
      /"Z" is not a choice of "c"/,
    ],
    [
      'points on an unscored choice',
      { formula: { points: 'c' } },
      /needs a CHOICE input whose choices all have points/,
    ],
    [
      'if branches of different types',
      { formula: { op: 'if', args: [{ bool: true }, { num: 1 }, { bool: false }] } },
      /branches must have the same type/,
    ],
    [
      'min with one operand',
      { formula: { op: 'min', args: [{ input: 'a' }] } },
      /at least two operands/,
    ],
    ['code-like strings are not expressions', { formula: 'a * 2' }, /./],
    ['unknown operator', { formula: { op: 'eval', args: [{ num: 1 }] } }, /./],
  ])('rejects %s', (_, override, message) => {
    expect(problemsOf(base(override)).join('\n')).toMatch(message);
  });

  it('rejects inconsistent ranges and units', () => {
    const problems = problemsOf(
      base({
        inputs: [
          numberInput('a', {
            hardRange: { min: 0, max: 100 },
            validatedRange: { min: 0, max: 150 },
            plausibleRange: { min: 10, max: 200 },
            units: [{ code: '1', factorToCanonical: 2, source: 'x' }],
            defaultUnit: { FR: 'kg' },
          }),
        ],
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'the validated range must lie inside the hard range',
        'the plausible range must lie inside the validated range',
        'the canonical unit needs no conversion entry',
        'unit "kg" is not allowed',
      ]),
    );
  });

  it('rejects non-positive conversion factors and conversions without a source note', () => {
    const problems = problemsOf(
      base({
        inputs: [numberInput('a', { units: [{ code: 'x', factorToCanonical: 0, source: '' }] })],
      }),
    );
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects duplicate keys, partial scoring and overlapping bands', () => {
    const problems = problemsOf(
      base({
        inputs: [
          numberInput('a'),
          numberInput('a'),
          {
            kind: 'CHOICE',
            key: 'c',
            label: t('c'),
            required: true,
            choices: [
              { value: 'X', label: t('X'), points: 1 },
              { value: 'Y', label: t('Y') },
            ],
          },
        ],
        interpretation: [
          { code: 'A', to: 10, severity: 'info', label: t('A') },
          { code: 'B', from: 5, severity: 'critical', label: t('B') },
        ],
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'duplicate input key "a"',
        'either every choice has points or none has',
        'bands must be ordered and must not overlap',
      ]),
    );
  });

  it('refuses deeply nested expressions', () => {
    let formula: unknown = { input: 'a' };
    for (let i = 0; i < 70; i++) formula = { op: 'sqrt', args: [formula] };
    expect(problemsOf(base({ formula })).join('\n')).toMatch(/nest at most/);
  });
});

describe('checksums and rounding', () => {
  it('hashes equal definitions equally, whatever the key order', () => {
    const a = { b: 1, a: { d: [1, 2], c: 'x' } };
    const b = { a: { c: 'x', d: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(definitionSha256(a)).toBe(definitionSha256(b));
    expect(definitionSha256(a)).not.toBe(definitionSha256({ ...a, b: 2 }));
  });

  it('rounds half away from zero on the decimal representation', () => {
    expect(roundHalfAwayFromZero(1.005, 2)).toBe(1.01);
    expect(roundHalfAwayFromZero(-0.5, 0)).toBe(-1);
    expect(roundHalfAwayFromZero(1234.5678, 1)).toBe(1234.6);
  });
});

describe('runTestCases', () => {
  const checked = checkDefinition(
    base({
      formula: { op: 'mul', args: [{ input: 'a' }, { num: 2 }] },
      inputs: [numberInput('a', { validatedRange: { min: 0, max: 10 } })],
    }),
  );
  if (!checked.ok) throw new Error('fixture must be valid');

  it('passes when every case matches, and fails with a readable reason otherwise', () => {
    const run = runTestCases(checked.definition, [
      {
        id: 'ok',
        inputs: { a: { value: 2 } },
        expectedOutcome: 'RESULT',
        expectedValue: 4,
        tolerance: 0,
        expectedBand: null,
      },
      {
        id: 'out',
        inputs: { a: { value: 20 } },
        expectedOutcome: 'OUT_OF_VALIDATED_RANGE',
        expectedValue: null,
        tolerance: null,
        expectedBand: null,
      },
    ]);
    expect(run).toMatchObject({ passed: true, total: 2, failed: 0, engineVersion: 'ts-1.0.0' });

    const failing = runTestCases(checked.definition, [
      {
        id: 'wrong',
        inputs: { a: { value: 2 } },
        expectedOutcome: 'RESULT',
        expectedValue: 5,
        tolerance: 0.5,
        expectedBand: null,
      },
    ]);
    expect(failing.passed).toBe(false);
    expect(failing.results[0]!.failure).toBe('expected 5 ± 0.5, got 4');
  });

  it('never passes an empty test set', () => {
    expect(runTestCases(checked.definition, []).passed).toBe(false);
  });
});
