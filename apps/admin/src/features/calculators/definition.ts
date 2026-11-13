// Read-only view of a calculator definition (schema version 1, ADR-012) for display in Admin Web.
// The API validates and evaluates definitions; nothing here computes a result.
import { z } from 'zod';
import type { Locale } from '@/i18n/messages';

/** Schemas used only to read a definition for display (the API owns the real checks). */
const localized = z.object({ fr: z.string(), en: z.string() });
const range = z.object({ min: z.number().optional(), max: z.number().optional() });

/** A formula node, as displayed. */
export type Expr =
  | { num: number }
  | { bool: boolean }
  | { str: string }
  | { input: string }
  | { present: string }
  | { points: string }
  | { op: 'round'; digits: number; args: [Expr] }
  | { op: 'piecewise'; cases: { when: Expr; then: Expr }[]; otherwise: Expr }
  | { op: string; args: Expr[] };

const expr: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.object({ num: z.number() }),
    z.object({ bool: z.boolean() }),
    z.object({ str: z.string() }),
    z.object({ input: z.string() }),
    z.object({ present: z.string() }),
    z.object({ points: z.string() }),
    z.object({ op: z.literal('round'), digits: z.number(), args: z.tuple([expr]) }),
    z.object({
      op: z.literal('piecewise'),
      cases: z.array(z.object({ when: expr, then: expr })),
      otherwise: expr,
    }),
    z.object({ op: z.string(), args: z.array(expr) }),
  ]),
);

const base = {
  key: z.string(),
  label: localized,
  required: z.boolean(),
  help: localized.optional(),
};
const numeric = {
  ...base,
  quantity: z.string(),
  canonicalUnit: z.string(),
  units: z
    .array(z.object({ code: z.string(), factorToCanonical: z.number(), source: z.string() }))
    .default([]),
  decimals: z.number().default(0),
  hardRange: range.optional(),
  validatedRange: range.optional(),
  plausibleRange: range.optional(),
};

const input = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NUMBER'), ...numeric }),
  z.object({ kind: z.literal('INTEGER'), ...numeric }),
  z.object({
    kind: z.literal('CHOICE'),
    ...base,
    choices: z.array(
      z.object({ value: z.string(), label: localized, points: z.number().optional() }),
    ),
  }),
  z.object({ kind: z.literal('BOOLEAN'), ...base }),
]);

export const definitionView = z.object({
  schemaVersion: z.literal(1),
  inputs: z.array(input),
  crossFieldRules: z
    .array(z.object({ id: z.string(), when: expr, outcome: z.string(), message: localized }))
    .default([]),
  formula: expr,
  result: z.object({ unit: z.string(), decimals: z.number(), label: localized }),
  interpretation: z
    .array(
      z.object({
        code: z.string(),
        from: z.number().optional(),
        to: z.number().optional(),
        severity: z.enum(['info', 'caution', 'warning', 'critical']),
        label: localized,
      }),
    )
    .default([]),
  limitations: localized,
});

export type DefinitionView = z.infer<typeof definitionView>;
export type InputView = DefinitionView['inputs'][number];
export type Range = z.infer<typeof range>;

/** The definition as displayed, or null when it does not match schema version 1. */
export function readDefinition(raw: unknown): DefinitionView | null {
  const parsed = definitionView.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Operators written between their two operands. */
const INFIX: Record<string, string> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
  pow: '^',
  lt: '<',
  le: '≤',
  gt: '>',
  ge: '≥',
  eq: '=',
  ne: '≠',
};

/**
 * The formula AST as readable mono text, with input labels instead of keys — the same notation
 * as the mobile app (`formula_text.dart`), e.g. `round(((140 − Âge) × Poids) ÷ (0.815 × Créatinine), 1)`.
 */
export function formulaText(node: Expr, labelOf: (key: string) => string): string {
  const text = (child: Expr) => formulaText(child, labelOf);
  if ('num' in node) return String(node.num);
  if ('bool' in node) return node.bool ? 'true' : 'false';
  if ('str' in node) return `"${node.str}"`;
  if ('input' in node) return labelOf(node.input);
  if ('points' in node) return labelOf(node.points);
  if ('present' in node) return `present(${labelOf(node.present)})`;
  if (node.op === 'round' && 'digits' in node)
    return `round(${text(node.args[0])}, ${node.digits})`;
  if (node.op === 'piecewise' && 'cases' in node) {
    const branches = node.cases.map((entry) => `${text(entry.when)} → ${text(entry.then)}`);
    return `{ ${[...branches, `… → ${text(node.otherwise)}`].join('; ')} }`;
  }
  if (!('args' in node)) return '';
  const args = node.args;
  const infix = INFIX[node.op];
  if (infix && args.length === 2) return `(${text(args[0]!)} ${infix} ${text(args[1]!)})`;
  switch (node.op) {
    case 'sqrt':
      return `√(${text(args[0]!)})`;
    case 'ln':
      return `ln(${text(args[0]!)})`;
    case 'log10':
      return `log₁₀(${text(args[0]!)})`;
    case 'exp':
      return `e^(${text(args[0]!)})`;
    case 'not':
      return `not(${text(args[0]!)})`;
    case 'sum':
      return `(${args.map(text).join(' + ')})`;
    default:
      return `${node.op}(${args.map(text).join(', ')})`;
  }
}

/** "[30 – 150]", "≥ 18", "≤ 250" or "—". */
export function rangeText(value: Range | undefined): string {
  if (!value || (value.min === undefined && value.max === undefined)) return '—';
  if (value.min !== undefined && value.max !== undefined) return `[${value.min} – ${value.max}]`;
  return value.min !== undefined ? `≥ ${value.min}` : `≤ ${value.max}`;
}

/** A text in the UI language. */
export function localizedOf(text: { fr: string; en: string }, locale: Locale): string {
  return text[locale];
}

/** One result of a stored test run. */
const testCaseResult = z.object({
  testCaseId: z.string(),
  passed: z.boolean(),
  expectedOutcome: z.string(),
  actualOutcome: z.string(),
  expectedValue: z.number().nullable(),
  actualValue: z.number().nullable(),
  expectedBand: z.string().nullable(),
  actualBand: z.string().nullable(),
  failure: z.string().nullable(),
});

/** A stored test run and the definition checksum it ran on. */
export const storedTestRun = z.object({
  passed: z.boolean(),
  ranAt: z.string(),
  engineVersion: z.string(),
  total: z.number(),
  failed: z.number(),
  results: z.array(testCaseResult),
  definitionSha256: z.string(),
});

export type StoredTestRun = z.infer<typeof storedTestRun>;

/** The stored run of a version, if it is about its current definition (else it must run again). */
export function currentRun(raw: unknown, definitionSha256: string): StoredTestRun | null {
  const parsed = storedTestRun.safeParse(raw);
  return parsed.success && parsed.data.definitionSha256 === definitionSha256 ? parsed.data : null;
}
