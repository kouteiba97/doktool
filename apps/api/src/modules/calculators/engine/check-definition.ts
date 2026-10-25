// Static checks of a definition before it can be saved (ADR-012 §3).
import {
  type CalculatorDefinition,
  type CalculatorInput,
  calculatorDefinition,
  type Expr,
  type Range,
} from './definition.js';

/** One problem found in a definition, with where it is. */
export interface DefinitionProblem {
  path: string;
  message: string;
}

/** Either the parsed definition, or the problems. */
export type CheckResult =
  { ok: true; definition: CalculatorDefinition } | { ok: false; problems: DefinitionProblem[] };

/** The types a formula node can have. */
type ValueType = 'number' | 'boolean' | 'string';

const MAX_NODES = 2000;
const MAX_DEPTH = 64;

/**
 * Validates a definition beyond its schema: unique keys, units, nested ranges, scored choices,
 * formula types, rules and ordered, non-overlapping bands.
 */
export function checkDefinition(raw: unknown): CheckResult {
  const parsed = calculatorDefinition.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }
  const definition = parsed.data;
  const problems: DefinitionProblem[] = [];
  const report = (path: string, message: string) => problems.push({ path, message });
  const inputs = new Map<string, CalculatorInput>();

  definition.inputs.forEach((input, index) => {
    const path = `inputs.${index}`;
    if (inputs.has(input.key)) report(`${path}.key`, `duplicate input key "${input.key}"`);
    inputs.set(input.key, input);

    if (input.kind === 'NUMBER' || input.kind === 'INTEGER') {
      const codes = input.units.map((unit) => unit.code);
      if (new Set(codes).size !== codes.length) report(`${path}.units`, 'duplicate unit code');
      if (codes.includes(input.canonicalUnit)) {
        report(`${path}.units`, 'the canonical unit needs no conversion entry');
      }
      const allowed = new Set([input.canonicalUnit, ...codes]);
      for (const [locale, code] of Object.entries(input.defaultUnit ?? {})) {
        if (code && !allowed.has(code))
          report(`${path}.defaultUnit.${locale}`, `unit "${code}" is not allowed`);
      }
      if (!within(input.validatedRange, input.hardRange)) {
        report(`${path}.validatedRange`, 'the validated range must lie inside the hard range');
      }
      if (!within(input.plausibleRange, input.validatedRange ?? input.hardRange)) {
        report(`${path}.plausibleRange`, 'the plausible range must lie inside the validated range');
      }
    }

    if (input.kind === 'CHOICE') {
      const values = input.choices.map((c) => c.value);
      if (new Set(values).size !== values.length)
        report(`${path}.choices`, 'duplicate choice value');
      const scored = input.choices.filter((c) => c.points !== undefined).length;
      if (scored !== 0 && scored !== input.choices.length) {
        report(`${path}.choices`, 'either every choice has points or none has');
      }
    }
  });

  const typer = new Typer(inputs, report);
  const formulaType = typer.type(definition.formula, 'formula', 0);
  if (formulaType && formulaType !== 'number')
    report('formula', `the formula must produce a number, not a ${formulaType}`);

  const ruleIds = new Set<string>();
  definition.crossFieldRules.forEach((rule, index) => {
    if (ruleIds.has(rule.id))
      report(`crossFieldRules.${index}.id`, `duplicate rule id "${rule.id}"`);
    ruleIds.add(rule.id);
    const type = typer.type(rule.when, `crossFieldRules.${index}.when`, 0);
    if (type && type !== 'boolean')
      report(`crossFieldRules.${index}.when`, 'a rule condition must be boolean');
  });
  if (typer.nodes > MAX_NODES)
    report('formula', `the expressions have more than ${MAX_NODES} nodes`);

  const codes = new Set<string>();
  definition.interpretation.forEach((band, index) => {
    const path = `interpretation.${index}`;
    if (codes.has(band.code)) report(`${path}.code`, `duplicate band code "${band.code}"`);
    codes.add(band.code);
    if (band.from !== undefined && band.to !== undefined && band.from >= band.to) {
      report(path, 'a band needs from < to');
    }
    if (band.from === undefined && index > 0)
      report(`${path}.from`, 'only the first band may be open below');
    if (band.to === undefined && index < definition.interpretation.length - 1) {
      report(`${path}.to`, 'only the last band may be open above');
    }
    const next = definition.interpretation[index + 1];
    if (next && band.to !== undefined && next.from !== undefined && band.to > next.from) {
      report(`${path}.to`, 'bands must be ordered and must not overlap');
    }
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, definition };
}

/** True when `inner` lies inside `outer` (missing bounds are unbounded). */
function within(inner: Range | undefined, outer: Range | undefined): boolean {
  if (!inner || !outer) return true;
  const minOk = outer.min === undefined || (inner.min !== undefined && inner.min >= outer.min);
  const maxOk = outer.max === undefined || (inner.max !== undefined && inner.max <= outer.max);
  return minOk && maxOk;
}

/** Infers the type of every formula node and reports type errors. */
class Typer {
  nodes = 0;

  constructor(
    private readonly inputs: Map<string, CalculatorInput>,
    private readonly report: (path: string, message: string) => void,
  ) {}

  /** Returns the type of `node`, or null after reporting a problem. */
  type(node: Expr, path: string, depth: number): ValueType | null {
    this.nodes++;
    if (depth > MAX_DEPTH) {
      this.report(path, `expressions may nest at most ${MAX_DEPTH} levels`);
      return null;
    }
    if ('num' in node) return 'number';
    if ('bool' in node) return 'boolean';
    if ('str' in node) return 'string';
    if ('input' in node) return this.inputType(node.input, path);
    if ('present' in node) return this.inputType(node.present, path) ? 'boolean' : null;
    if ('points' in node) {
      const input = this.inputs.get(node.points);
      if (input?.kind !== 'CHOICE' || input.choices.some((c) => c.points === undefined)) {
        this.report(
          path,
          `"points" needs a CHOICE input whose choices all have points ("${node.points}")`,
        );
        return null;
      }
      return 'number';
    }

    const child = (index: number, sub = `${path}.args.${index}`) =>
      this.type((node as { args: Expr[] }).args[index]!, sub, depth + 1);
    const expect = (
      types: (ValueType | null)[],
      wanted: ValueType,
      what: string,
    ): ValueType | null => {
      if (types.some((t) => t === null)) return null;
      if (types.some((t) => t !== wanted)) {
        this.report(path, `"${what}" needs ${wanted} operands`);
        return null;
      }
      return wanted;
    };

    switch (node.op) {
      case 'add':
      case 'sub':
      case 'mul':
      case 'div':
      case 'pow':
        return expect([child(0), child(1)], 'number', node.op);
      case 'lt':
      case 'le':
      case 'gt':
      case 'ge':
        return expect([child(0), child(1)], 'number', node.op) && 'boolean';
      case 'eq':
      case 'ne': {
        const [a, b] = [child(0), child(1)];
        if (a === null || b === null) return null;
        if (a !== b) {
          this.report(path, `"${node.op}" compares values of the same type`);
          return null;
        }
        this.checkChoiceLiteral(node.args, path);
        return 'boolean';
      }
      case 'sqrt':
      case 'ln':
      case 'log10':
      case 'exp':
        return expect([child(0)], 'number', node.op);
      case 'not':
        return expect([child(0)], 'boolean', 'not');
      case 'min':
      case 'max':
      case 'sum':
      case 'and':
      case 'or': {
        if (node.op !== 'sum' && node.args.length < 2) {
          this.report(path, `"${node.op}" needs at least two operands`);
          return null;
        }
        const wanted = node.op === 'and' || node.op === 'or' ? 'boolean' : 'number';
        return expect(
          node.args.map((_, index) => child(index)),
          wanted,
          node.op,
        );
      }
      case 'round':
        return expect([child(0)], 'number', 'round');
      case 'if': {
        const condition = child(0);
        const [a, b] = [child(1), child(2)];
        if (condition !== null && condition !== 'boolean')
          this.report(`${path}.args.0`, '"if" needs a boolean condition');
        if (a !== null && b !== null && a !== b)
          this.report(path, '"if" branches must have the same type');
        return condition === 'boolean' && a !== null && a === b ? a : null;
      }
      case 'piecewise': {
        const types = node.cases.map((entry, index) => {
          const when = this.type(entry.when, `${path}.cases.${index}.when`, depth + 1);
          if (when !== null && when !== 'boolean')
            this.report(`${path}.cases.${index}.when`, 'a case condition must be boolean');
          return this.type(entry.then, `${path}.cases.${index}.then`, depth + 1);
        });
        types.push(this.type(node.otherwise, `${path}.otherwise`, depth + 1));
        if (types.some((t) => t === null)) return null;
        if (new Set(types).size !== 1) {
          this.report(path, '"piecewise" results must all have the same type');
          return null;
        }
        return types[0]!;
      }
    }
  }

  /** The type an input produces in a formula (CHOICE gives its value as text). */
  private inputType(inputKey: string, path: string): ValueType | null {
    const input = this.inputs.get(inputKey);
    if (!input) {
      this.report(path, `unknown input "${inputKey}"`);
      return null;
    }
    return input.kind === 'CHOICE' ? 'string' : input.kind === 'BOOLEAN' ? 'boolean' : 'number';
  }

  /** `eq(input(choice), str("X"))`: "X" must be one of the declared choice values. */
  private checkChoiceLiteral(args: [Expr, Expr], path: string): void {
    const [a, b] = args;
    const pairs: [Expr, Expr][] = [
      [a, b],
      [b, a],
    ];
    for (const [ref, literal] of pairs) {
      if ('input' in ref && 'str' in literal) {
        const input = this.inputs.get(ref.input);
        if (input?.kind === 'CHOICE' && !input.choices.some((c) => c.value === literal.str)) {
          this.report(path, `"${literal.str}" is not a choice of "${ref.input}"`);
        }
      }
    }
  }
}
