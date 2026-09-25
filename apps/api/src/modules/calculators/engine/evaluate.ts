// The authoritative calculator engine (ADR-003, ADR-012 §4). Pure and deterministic: definition +
// inputs → RESULT | INVALID | OUT_OF_VALIDATED_RANGE. The Dart engine implements the same
// contract and both run packages/calculator-vectors in CI.
import type {
  CalculatorDefinition,
  CalculatorInput,
  Expr,
  InterpretationBand,
  LocalizedText,
  NumericInput,
  Range,
} from './definition.js';

export const ENGINE_VERSION = 'ts-1.0.0';

export type InputValue = { value: number | string | boolean | null; unit?: string };
export type EvaluationInputs = Record<string, InputValue | null | undefined>;

export type IssueCode =
  | 'UNKNOWN_INPUT'
  | 'REQUIRED'
  | 'WRONG_TYPE'
  | 'NOT_AN_INTEGER'
  | 'UNKNOWN_UNIT'
  | 'UNKNOWN_CHOICE'
  | 'HARD_RANGE'
  | 'CROSS_FIELD'
  | 'VALIDATED_RANGE'
  | 'MISSING_INPUT'
  | 'NON_FINITE_RESULT';

export interface Issue {
  code: IssueCode;
  input?: string;
  /** The range that was not met, in the input's canonical unit. */
  range?: Range & { unit: string };
  ruleId?: string;
  message?: LocalizedText;
}

export interface Conversion {
  input: string;
  from: { value: number; unit: string };
  to: { value: number; unit: string };
}

export interface PlausibilityNote {
  input: string;
  range: Range & { unit: string };
}

export type Evaluation =
  | {
      outcome: 'RESULT';
      value: number;
      unit: string;
      decimals: number;
      band: Pick<InterpretationBand, 'code' | 'severity' | 'label'> | null;
      notes: PlausibilityNote[];
      conversions: Conversion[];
    }
  | { outcome: 'INVALID' | 'OUT_OF_VALIDATED_RANGE'; issues: Issue[]; conversions: Conversion[] };

type Value = number | string | boolean;

class MissingInput extends Error {
  constructor(readonly input: string) {
    super(`missing input ${input}`);
  }
}

const inRange = (value: number, range: Range | undefined) =>
  !range ||
  ((range.min === undefined || value >= range.min) &&
    (range.max === undefined || value <= range.max));

export function evaluate(definition: CalculatorDefinition, raw: EvaluationInputs): Evaluation {
  const declared = new Map(definition.inputs.map((input) => [input.key, input]));
  const invalid: Issue[] = [];
  const conversions: Conversion[] = [];
  const values = new Map<string, Value>();

  for (const inputKey of Object.keys(raw)) {
    if (!declared.has(inputKey) && raw[inputKey] != null)
      invalid.push({ code: 'UNKNOWN_INPUT', input: inputKey });
  }

  // 1. Presence, type and unit conversion to canonical units.
  for (const input of definition.inputs) {
    const given = raw[input.key];
    if (given == null || given.value === null || given.value === undefined) {
      if (input.required) invalid.push({ code: 'REQUIRED', input: input.key });
      continue;
    }
    const accepted = acceptValue(input, given, conversions);
    if ('issue' in accepted) invalid.push(accepted.issue);
    else values.set(input.key, accepted.value);
  }
  if (invalid.length > 0) return { outcome: 'INVALID', issues: invalid, conversions };

  // 2. Hard ranges: physiologically impossible values block.
  for (const input of numericInputs(definition)) {
    const value = values.get(input.key);
    if (typeof value === 'number' && !inRange(value, input.hardRange)) {
      invalid.push({
        code: 'HARD_RANGE',
        input: input.key,
        range: { ...input.hardRange, unit: input.canonicalUnit },
      });
    }
  }
  if (invalid.length > 0) return { outcome: 'INVALID', issues: invalid, conversions };

  // 3. Cross-field rules.
  const outOfRange: Issue[] = [];
  for (const rule of definition.crossFieldRules) {
    let holds: Value;
    try {
      holds = run(rule.when, values, definition);
    } catch (error) {
      if (error instanceof MissingInput) {
        invalid.push({ code: 'MISSING_INPUT', input: error.input, ruleId: rule.id });
        continue;
      }
      throw error;
    }
    if (holds !== true) {
      const issue: Issue = { code: 'CROSS_FIELD', ruleId: rule.id, message: rule.message };
      (rule.outcome === 'INVALID' ? invalid : outOfRange).push(issue);
    }
  }
  if (invalid.length > 0) return { outcome: 'INVALID', issues: invalid, conversions };

  // 4. Validated ranges: outside the population the formula was validated on → not computed.
  for (const input of numericInputs(definition)) {
    const value = values.get(input.key);
    if (typeof value === 'number' && !inRange(value, input.validatedRange)) {
      outOfRange.push({
        code: 'VALIDATED_RANGE',
        input: input.key,
        range: { ...input.validatedRange, unit: input.canonicalUnit },
      });
    }
  }
  if (outOfRange.length > 0)
    return { outcome: 'OUT_OF_VALIDATED_RANGE', issues: outOfRange, conversions };

  // 5. Plausibility notes (never block).
  const notes: PlausibilityNote[] = [];
  for (const input of numericInputs(definition)) {
    const value = values.get(input.key);
    if (
      typeof value === 'number' &&
      input.plausibleRange &&
      !inRange(value, input.plausibleRange)
    ) {
      notes.push({
        input: input.key,
        range: { ...input.plausibleRange, unit: input.canonicalUnit },
      });
    }
  }

  // 6. The formula.
  let value: Value;
  try {
    value = run(definition.formula, values, definition);
  } catch (error) {
    if (error instanceof MissingInput) {
      return {
        outcome: 'INVALID',
        issues: [{ code: 'MISSING_INPUT', input: error.input }],
        conversions,
      };
    }
    throw error;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { outcome: 'INVALID', issues: [{ code: 'NON_FINITE_RESULT' }], conversions };
  }
  const band = definition.interpretation.find(
    (candidate) =>
      (candidate.from === undefined || value >= candidate.from) &&
      (candidate.to === undefined || value < candidate.to),
  );
  return {
    outcome: 'RESULT',
    value,
    unit: definition.result.unit,
    decimals: definition.result.decimals,
    band: band ? { code: band.code, severity: band.severity, label: band.label } : null,
    notes,
    conversions,
  };
}

function numericInputs(definition: CalculatorDefinition): NumericInput[] {
  return definition.inputs.filter(
    (input): input is NumericInput => input.kind === 'NUMBER' || input.kind === 'INTEGER',
  );
}

function acceptValue(
  input: CalculatorInput,
  given: InputValue,
  conversions: Conversion[],
): { value: Value } | { issue: Issue } {
  const wrongType = { issue: { code: 'WRONG_TYPE' as const, input: input.key } };
  switch (input.kind) {
    case 'BOOLEAN':
      return typeof given.value === 'boolean' ? { value: given.value } : wrongType;
    case 'CHOICE':
      if (typeof given.value !== 'string') return wrongType;
      return input.choices.some((choice) => choice.value === given.value)
        ? { value: given.value }
        : { issue: { code: 'UNKNOWN_CHOICE', input: input.key } };
    case 'NUMBER':
    case 'INTEGER': {
      const number = given.value;
      if (typeof number !== 'number' || !Number.isFinite(number)) return wrongType;
      if (input.kind === 'INTEGER' && !Number.isInteger(number)) {
        return { issue: { code: 'NOT_AN_INTEGER', input: input.key } };
      }
      const unit = given.unit ?? input.canonicalUnit;
      if (unit === input.canonicalUnit) return { value: number };
      const conversion = input.units.find((candidate) => candidate.code === unit);
      if (!conversion) return { issue: { code: 'UNKNOWN_UNIT', input: input.key } };
      const canonical = number * conversion.factorToCanonical;
      conversions.push({
        input: input.key,
        from: { value: number, unit },
        to: { value: canonical, unit: input.canonicalUnit },
      });
      return { value: canonical };
    }
  }
}

function run(node: Expr, values: Map<string, Value>, definition: CalculatorDefinition): Value {
  const num = (expr: Expr) => run(expr, values, definition) as number;
  const bool = (expr: Expr) => run(expr, values, definition) as boolean;

  if ('num' in node) return node.num;
  if ('bool' in node) return node.bool;
  if ('str' in node) return node.str;
  if ('present' in node) return values.has(node.present);
  if ('input' in node) {
    const value = values.get(node.input);
    if (value === undefined) throw new MissingInput(node.input);
    return value;
  }
  if ('points' in node) {
    const selected = values.get(node.points);
    if (selected === undefined) throw new MissingInput(node.points);
    const input = definition.inputs.find((candidate) => candidate.key === node.points);
    const choice =
      input?.kind === 'CHOICE' ? input.choices.find((c) => c.value === selected) : undefined;
    return choice?.points ?? Number.NaN;
  }

  switch (node.op) {
    case 'add':
      return num(node.args[0]) + num(node.args[1]);
    case 'sub':
      return num(node.args[0]) - num(node.args[1]);
    case 'mul':
      return num(node.args[0]) * num(node.args[1]);
    case 'div':
      return num(node.args[0]) / num(node.args[1]);
    case 'pow':
      return Math.pow(num(node.args[0]), num(node.args[1]));
    case 'lt':
      return num(node.args[0]) < num(node.args[1]);
    case 'le':
      return num(node.args[0]) <= num(node.args[1]);
    case 'gt':
      return num(node.args[0]) > num(node.args[1]);
    case 'ge':
      return num(node.args[0]) >= num(node.args[1]);
    case 'eq':
      return run(node.args[0], values, definition) === run(node.args[1], values, definition);
    case 'ne':
      return run(node.args[0], values, definition) !== run(node.args[1], values, definition);
    case 'sqrt':
      return Math.sqrt(num(node.args[0]));
    case 'ln':
      return Math.log(num(node.args[0]));
    case 'log10':
      return Math.log10(num(node.args[0]));
    case 'exp':
      return Math.exp(num(node.args[0]));
    case 'not':
      return !bool(node.args[0]);
    case 'min':
      return Math.min(...node.args.map(num));
    case 'max':
      return Math.max(...node.args.map(num));
    case 'sum':
      return node.args.reduce((total, arg) => total + num(arg), 0);
    case 'and':
      return node.args.every(bool);
    case 'or':
      return node.args.some(bool);
    case 'round':
      return roundHalfAwayFromZero(num(node.args[0]), node.digits);
    case 'if':
      return bool(node.args[0])
        ? run(node.args[1], values, definition)
        : run(node.args[2], values, definition);
    case 'piecewise': {
      const match = node.cases.find((entry) => bool(entry.when));
      return run(match ? match.then : node.otherwise, values, definition);
    }
  }
}

/**
 * Rounds to `digits` decimals, halves away from zero (2.5 → 3, −2.5 → −3). The exponent shift
 * avoids the binary representation error of multiplying by 10^digits (1.005 → 1.01).
 */
export function roundHalfAwayFromZero(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const shifted = Math.round(Number(`${Math.abs(value)}e${digits}`));
  return sign * Number(`${shifted}e-${digits}`);
}
