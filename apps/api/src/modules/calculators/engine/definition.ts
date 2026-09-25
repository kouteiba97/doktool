// Calculator definition format, schema version 1 (ADR-012). Pure data: no code, no eval.
import { z } from 'zod';

const MAX_TEXT = 2000;

export const localizedText = z
  .object({
    fr: z.string().trim().min(1).max(MAX_TEXT),
    en: z.string().trim().min(1).max(MAX_TEXT),
  })
  .strict();
export type LocalizedText = z.infer<typeof localizedText>;

const key = z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'keys are camelCase, 1–40 characters');
const unitCode = z.string().trim().min(1).max(20);
const finite = z.number().finite();

export const range = z
  .object({ min: finite.optional(), max: finite.optional() })
  .strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, 'min must be ≤ max');
export type Range = z.infer<typeof range>;

/** Closed operator set of the formula AST (audit §9). */
export type Expr =
  | { num: number }
  | { bool: boolean }
  | { str: string }
  | { input: string }
  | { present: string }
  | { points: string }
  | { op: BinaryOp; args: [Expr, Expr] }
  | { op: UnaryOp; args: [Expr] }
  | { op: VariadicOp; args: Expr[] }
  | { op: 'round'; digits: number; args: [Expr] }
  | { op: 'if'; args: [Expr, Expr, Expr] }
  | { op: 'piecewise'; cases: { when: Expr; then: Expr }[]; otherwise: Expr };

export const BINARY_OPS = [
  'add',
  'sub',
  'mul',
  'div',
  'pow',
  'lt',
  'le',
  'gt',
  'ge',
  'eq',
  'ne',
] as const;
export const UNARY_OPS = ['sqrt', 'ln', 'log10', 'exp', 'not'] as const;
export const VARIADIC_OPS = ['min', 'max', 'sum', 'and', 'or'] as const;
export type BinaryOp = (typeof BINARY_OPS)[number];
export type UnaryOp = (typeof UNARY_OPS)[number];
export type VariadicOp = (typeof VARIADIC_OPS)[number];

export const expr: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.object({ num: finite }).strict(),
    z.object({ bool: z.boolean() }).strict(),
    z.object({ str: z.string().min(1).max(60) }).strict(),
    z.object({ input: key }).strict(),
    z.object({ present: key }).strict(),
    z.object({ points: key }).strict(),
    z.object({ op: z.enum(BINARY_OPS), args: z.tuple([expr, expr]) }).strict(),
    z.object({ op: z.enum(UNARY_OPS), args: z.tuple([expr]) }).strict(),
    z.object({ op: z.enum(VARIADIC_OPS), args: z.array(expr).min(1).max(50) }).strict(),
    z
      .object({
        op: z.literal('round'),
        digits: z.number().int().min(0).max(10),
        args: z.tuple([expr]),
      })
      .strict(),
    z.object({ op: z.literal('if'), args: z.tuple([expr, expr, expr]) }).strict(),
    z
      .object({
        op: z.literal('piecewise'),
        cases: z
          .array(z.object({ when: expr, then: expr }).strict())
          .min(1)
          .max(50),
        otherwise: expr,
      })
      .strict(),
  ]),
);

/** A non-canonical unit and how it converts: canonical = value × factorToCanonical. */
const unitConversion = z
  .object({
    code: unitCode,
    factorToCanonical: finite.positive(),
    /** Where the factor is stated in the UNIT_CONVERSION source (page, table…). */
    source: z.string().trim().min(1).max(200),
  })
  .strict();

const choice = z
  .object({
    value: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    label: localizedText,
    points: finite.optional(),
  })
  .strict();

const baseInput = {
  key,
  label: localizedText,
  required: z.boolean(),
  help: localizedText.optional(),
};

const numericInput = {
  ...baseInput,
  /** What is measured, e.g. BODY_WEIGHT (free code, used for display and analytics). */
  quantity: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
  canonicalUnit: unitCode,
  units: z.array(unitConversion).max(10).default([]),
  defaultUnit: z.object({ FR: unitCode.optional(), EN: unitCode.optional() }).strict().optional(),
  /** Display decimals of the field. */
  decimals: z.number().int().min(0).max(6).default(0),
  hardRange: range.optional(),
  validatedRange: range.optional(),
  plausibleRange: range.optional(),
};

export const calculatorInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NUMBER'), ...numericInput }).strict(),
  z.object({ kind: z.literal('INTEGER'), ...numericInput }).strict(),
  z
    .object({ kind: z.literal('CHOICE'), ...baseInput, choices: z.array(choice).min(2).max(20) })
    .strict(),
  z.object({ kind: z.literal('BOOLEAN'), ...baseInput }).strict(),
]);
export type CalculatorInput = z.infer<typeof calculatorInput>;
export type NumericInput = Extract<CalculatorInput, { kind: 'NUMBER' | 'INTEGER' }>;

export const crossFieldRule = z
  .object({
    id: key,
    /** Must be true for the inputs to be acceptable. */
    when: expr,
    outcome: z.enum(['INVALID', 'OUT_OF_VALIDATED_RANGE']),
    message: localizedText,
  })
  .strict();

export const interpretationBand = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/),
    from: finite.optional(),
    to: finite.optional(),
    severity: z.enum(['info', 'caution', 'warning', 'critical']),
    label: localizedText,
  })
  .strict();
export type InterpretationBand = z.infer<typeof interpretationBand>;

export const calculatorDefinition = z
  .object({
    schemaVersion: z.literal(1),
    inputs: z.array(calculatorInput).min(1).max(40),
    crossFieldRules: z.array(crossFieldRule).max(20).default([]),
    formula: expr,
    result: z
      .object({
        unit: z.string().trim().max(20),
        decimals: z.number().int().min(0).max(6),
        label: localizedText,
      })
      .strict(),
    interpretation: z.array(interpretationBand).max(20).default([]),
    limitations: localizedText,
  })
  .strict();

export type CalculatorDefinition = z.infer<typeof calculatorDefinition>;
