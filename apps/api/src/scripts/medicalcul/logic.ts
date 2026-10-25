// Translates the `f_Calculer()` function of a Medicalcul page into a DokTool calculator definition
// by symbolic reading of its syntax tree (acorn). Nothing is executed. Only constructs whose
// meaning is exactly representable in the engine's closed operator set are accepted; anything else
// stops the translation with a reason, and the calculator stays out of the import.
import { parse as parseScript } from 'acorn';
import type {
  AssignmentExpression,
  CallExpression,
  Expression,
  ForStatement,
  FunctionDeclaration,
  IfStatement,
  MemberExpression,
  Node as JsNode,
  Statement,
  TryStatement,
  VariableDeclaration,
} from 'acorn';
import {
  type CalculatorDefinition,
  type CalculatorInput,
  canonicalJson,
  checkDefinition,
  type Expr,
  type InterpretationBand,
} from '../../modules/calculators/index.js';
import type { PageControl, ParsedPage } from './page.js';

/** A construct the translation refuses; the message is reported in the coverage matrix. */
export class Unsupported extends Error {}

/** The page computes nothing (a reference table or a classification to read). */
export class NoCalculation extends Unsupported {}

const UNDEFINED_TEXT = '\u0000';
const MAX_LOOP = 50;
/** Larger formulas are not reviewable by a person; they stay out of the import. */
const MAX_NODES = 2000;

const sizes = new WeakMap<object, number>();
/** Node count of an expression tree (shared subtrees counted each time), capped. */
function treeSize(e: Expr): number {
  const known = sizes.get(e);
  if (known !== undefined) return known;
  let size = 1;
  if ('args' in e)
    for (const arg of e.args as Expr[]) size = Math.min(size + treeSize(arg), MAX_NODES + 1);
  if ('cases' in e) {
    for (const c of e.cases)
      size = Math.min(size + treeSize(c.when) + treeSize(c.then), MAX_NODES + 1);
    size = Math.min(size + treeSize(e.otherwise), MAX_NODES + 1);
  }
  sizes.set(e, size);
  return size;
}

function bounded(e: Expr): Expr {
  if (treeSize(e) > MAX_NODES) throw new Unsupported(`formula larger than ${MAX_NODES} nodes`);
  return e;
}

type Val =
  | { t: 'num'; e: Expr; int: boolean }
  /** `x.toFixed(n)`: a display string in JS, accepted only as a result written to a field. */
  | { t: 'fixed'; e: Expr; int: boolean; digits: number }
  | { t: 'bool'; e: Expr }
  /** A constant text or an `if` tree of constant texts (interpretation labels). */
  | { t: 'str'; e: Expr }
  /** `document.Form.<field>.value` before any numeric coercion: still a string in JS. */
  | { t: 'raw'; field: string }
  | { t: 'undef' }
  /** Different kinds on two branches: an error only if something reads it afterwards. */
  | { t: 'conflict'; what: string };

type Env = Map<string, Val>;
interface State {
  vars: Env;
  outputs: Env;
}

export interface Translation {
  definition: CalculatorDefinition;
  /** Points a reviewer must look at: values the source does not state and DokTool requires. */
  reviewNotes: string[];
}

interface Field {
  kind: PageControl['kind'];
  key: string;
  controls: PageControl[];
}

export function translate(page: ParsedPage): Translation {
  const fn = findCalculer(page.scripts);
  const fields = indexFields(page.controls);
  const context = new Context(fields);
  const state: State = { vars: new Map(), outputs: new Map() };
  context.block(fn.body.body, state);
  return context.build(state);
}

function findCalculer(scripts: string[]): FunctionDeclaration {
  for (const script of scripts) {
    let program;
    try {
      program = parseScript(script, { ecmaVersion: 2020, sourceType: 'script', locations: true });
    } catch (error) {
      throw new Unsupported(`script does not parse: ${(error as Error).message}`);
    }
    for (const statement of program.body) {
      if (statement.type === 'FunctionDeclaration' && statement.id?.name === 'f_Calculer') {
        return statement;
      }
    }
  }
  throw new Unsupported('no f_Calculer function');
}

// ─────────────────────────────── form fields ───────────────────────────────

/** camelCase engine key from a form field name, stable and unique within the page. */
export function keyFor(name: string, taken: Set<string>): string {
  let key = name.replace(/[^A-Za-z0-9]/g, '');
  if (!key) key = 'field';
  if (/^[0-9]/.test(key)) key = `x${key}`;
  key = (key[0]!.toLowerCase() + key.slice(1)).slice(0, 36);
  let unique = key;
  for (let n = 2; taken.has(unique); n++) unique = `${key}${n}`;
  taken.add(unique);
  return unique;
}

function indexFields(controls: PageControl[]): Map<string, Field> {
  const fields = new Map<string, Field>();
  const taken = new Set<string>();
  for (const control of controls) {
    const existing = fields.get(control.name);
    if (existing) {
      if (existing.kind !== control.kind)
        throw new Unsupported(
          `field "${control.name}" is both ${existing.kind} and ${control.kind}`,
        );
      existing.controls.push(control);
    } else {
      fields.set(control.name, {
        kind: control.kind,
        key: keyFor(control.name, taken),
        controls: [control],
      });
    }
  }
  return fields;
}

const choiceValue = (index: number) => `o${index + 1}`;

/** Numeric value of a radio or option, exactly as JS `value * 1` reads it. */
function pointsOf(raw: string | null, where: string): number {
  const text = (raw ?? '').trim();
  const value = text === '' ? Number.NaN : Number(text);
  if (!Number.isFinite(value)) throw new Unsupported(`${where}: value "${raw}" is not a number`);
  return value;
}

// ──────────────────────────────── evaluation ────────────────────────────────

const num = (e: Expr, int: boolean): Val => ({ t: 'num', e, int });
const isConst = (e: Expr): e is { num: number } => 'num' in e;

class Context {
  private readonly used = new Set<string>();

  constructor(private readonly fields: Map<string, Field>) {}

  /**
   * `document.Form.<x>`: browsers resolve <x> as a field name, then as an element id. Returns the
   * field and, when reached through an id, the one control it designates.
   */
  private lookup(x: string): { name: string; field: Field; control: PageControl | null } {
    const byName = this.fields.get(x);
    if (byName) return { name: x, field: byName, control: null };
    for (const [name, field] of this.fields) {
      const control = field.controls.find((candidate) => candidate.id === x);
      if (control) return { name, field, control };
    }
    throw new Unsupported(`field "${x}" is not on the page`);
  }

  block(statements: readonly Statement[], state: State): void {
    for (const statement of statements) this.statement(statement, state);
  }

  private statement(node: Statement, state: State): void {
    switch (node.type) {
      case 'EmptyStatement':
        return;
      case 'BlockStatement':
        return this.block(node.body, state);
      case 'VariableDeclaration':
        return this.declare(node, state);
      case 'ExpressionStatement':
        return this.expressionStatement(node.expression, state);
      case 'IfStatement':
        return this.ifStatement(node, state);
      case 'ForStatement':
        return this.forStatement(node, state);
      case 'TryStatement':
        return this.tryStatement(node);
      default:
        throw new Unsupported(`${node.type} at line ${line(node)}`);
    }
  }

  private declare(node: VariableDeclaration, state: State): void {
    for (const declarator of node.declarations) {
      if (declarator.id.type !== 'Identifier') throw new Unsupported('destructuring');
      state.vars.set(
        declarator.id.name,
        declarator.init ? this.value(declarator.init, state) : { t: 'undef' },
      );
    }
  }

  private expressionStatement(expression: Expression, state: State): void {
    if (expression.type === 'AssignmentExpression') return this.assign(expression, state);
    if (expression.type === 'CallExpression' && isAndroidBridge(expression)) return;
    if (expression.type === 'UpdateExpression' && expression.argument.type === 'Identifier') {
      const current = this.number(this.read(expression.argument.name, state), expression);
      const step: Expr = { num: 1 };
      state.vars.set(
        expression.argument.name,
        num(
          { op: expression.operator === '++' ? 'add' : 'sub', args: [current.e, step] },
          current.int,
        ),
      );
      return;
    }
    throw new Unsupported(`statement ${describe(expression)} at line ${line(expression)}`);
  }

  private assign(node: AssignmentExpression, state: State): void {
    const right = this.value(node.right, state);
    if (node.left.type === 'Identifier') {
      const name = node.left.name;
      const value =
        node.operator === '='
          ? right
          : this.binary(compoundOperator(node.operator), this.read(name, state), right, node);
      state.vars.set(name, value);
      return;
    }
    if (node.left.type === 'MemberExpression') {
      const target = formProperty(node.left);
      if (!target || target.property !== 'value')
        throw new Unsupported(`assignment to ${describe(node.left)} at line ${line(node)}`);
      const { name, field } = this.lookup(target.field);
      if (field.kind !== 'output') throw new Unsupported(`the script writes into input "${name}"`);
      if (node.operator !== '=') throw new Unsupported(`${node.operator} on a result field`);
      state.outputs.set(name, right);
      return;
    }
    throw new Unsupported(`assignment at line ${line(node)}`);
  }

  private ifStatement(node: IfStatement, state: State): void {
    const condition = this.boolean(this.value(node.test, state), node.test);
    const consequent = clone(state);
    this.statement(node.consequent, consequent);
    const alternate = clone(state);
    if (node.alternate) this.statement(node.alternate, alternate);
    state.vars = merge(condition, consequent.vars, alternate.vars);
    state.outputs = merge(condition, consequent.outputs, alternate.outputs);
  }

  private forStatement(node: ForStatement, state: State): void {
    const init = node.init;
    if (
      !init ||
      init.type !== 'VariableDeclaration' ||
      init.declarations.length !== 1 ||
      init.declarations[0]!.id.type !== 'Identifier' ||
      !init.declarations[0]!.init
    )
      throw new Unsupported(`loop form at line ${line(node)}`);
    const variable = init.declarations[0]!.id.name;
    const start = literalNumber(init.declarations[0]!.init);
    const test = node.test;
    if (
      !test ||
      test.type !== 'BinaryExpression' ||
      test.left.type !== 'Identifier' ||
      test.left.name !== variable ||
      (test.operator !== '<' && test.operator !== '<=')
    )
      throw new Unsupported(`loop condition at line ${line(node)}`);
    const end = literalNumber(test.right);
    const update = node.update;
    const increments =
      update?.type === 'UpdateExpression' &&
      update.operator === '++' &&
      update.argument.type === 'Identifier' &&
      update.argument.name === variable;
    if (start === null || end === null || !increments)
      throw new Unsupported(`loop bounds at line ${line(node)}`);
    const last = test.operator === '<' ? end - 1 : end;
    if (last - start + 1 > MAX_LOOP) throw new Unsupported('loop too long');
    for (let i = start; i <= last; i++) {
      state.vars.set(variable, num({ num: i }, Number.isInteger(i)));
      this.statement(node.body, state);
    }
    state.vars.delete(variable);
  }

  /** Only the Android history call is wrapped in try/catch; it has no effect on results. */
  private tryStatement(node: TryStatement): void {
    const onlyBridge = node.block.body.every(
      (statement) =>
        statement.type === 'ExpressionStatement' &&
        statement.expression.type === 'CallExpression' &&
        isAndroidBridge(statement.expression),
    );
    if (!onlyBridge || node.finalizer) throw new Unsupported(`try block at line ${line(node)}`);
  }

  // ─────────────────────────────── expressions ───────────────────────────────

  private read(name: string, state: State): Val {
    const value = state.vars.get(name);
    if (!value) throw new Unsupported(`unknown variable "${name}"`);
    if (value.t === 'conflict') throw new Unsupported(value.what);
    return value;
  }

  value(node: Expression | JsNode, state: State): Val {
    switch (node.type) {
      case 'Literal': {
        const literal = (node as { value: unknown }).value;
        if (typeof literal === 'number') return num({ num: literal }, Number.isInteger(literal));
        if (typeof literal === 'string') return { t: 'str', e: { str: literal } };
        if (typeof literal === 'boolean') return { t: 'bool', e: { bool: literal } };
        throw new Unsupported(`literal ${String(literal)}`);
      }
      case 'Identifier': {
        const name = (node as { name: string }).name;
        if (name === 'undefined') return { t: 'undef' };
        return this.read(name, state);
      }
      case 'ParenthesizedExpression':
        return this.value((node as { expression: Expression }).expression, state);
      case 'MemberExpression':
        return this.member(node as MemberExpression, state);
      case 'CallExpression':
        return this.call(node as CallExpression, state);
      case 'UnaryExpression': {
        const unary = node as { operator: string; argument: Expression };
        const operand = this.value(unary.argument, state);
        if (unary.operator === '!')
          return { t: 'bool', e: { op: 'not', args: [this.boolean(operand, node)] } };
        const n = this.number(operand, node);
        if (unary.operator === '+') return n;
        if (unary.operator === '-')
          return isConst(n.e)
            ? num({ num: -n.e.num }, n.int)
            : num({ op: 'sub', args: [{ num: 0 }, n.e] }, n.int);
        throw new Unsupported(`operator ${unary.operator}`);
      }
      case 'BinaryExpression': {
        const binary = node as { operator: string; left: Expression; right: Expression };
        return this.binary(
          binary.operator,
          this.value(binary.left, state),
          this.value(binary.right, state),
          node,
        );
      }
      case 'LogicalExpression': {
        const logical = node as { operator: string; left: Expression; right: Expression };
        const left = this.value(logical.left, state);
        const right = this.value(logical.right, state);
        if (left.t !== 'bool' || right.t !== 'bool')
          throw new Unsupported(`${logical.operator} on non-boolean values at line ${line(node)}`);
        if (logical.operator === '&&')
          return { t: 'bool', e: { op: 'and', args: [left.e, right.e] } };
        if (logical.operator === '||')
          return { t: 'bool', e: { op: 'or', args: [left.e, right.e] } };
        throw new Unsupported(`operator ${logical.operator}`);
      }
      case 'ConditionalExpression': {
        const conditional = node as {
          test: Expression;
          consequent: Expression;
          alternate: Expression;
        };
        const condition = this.boolean(this.value(conditional.test, state), node);
        return mergeValue(
          condition,
          this.value(conditional.consequent, state),
          this.value(conditional.alternate, state),
          'conditional expression',
        );
      }
      default:
        throw new Unsupported(`${node.type} at line ${line(node)}`);
    }
  }

  private member(node: MemberExpression, state: State): Val {
    const constant = mathConstant(node);
    if (constant !== null) return num({ num: constant }, false);
    const target = formProperty(node);
    if (!target) throw new Unsupported(`${describe(node)} at line ${line(node)}`);
    const { name, field, control } = this.lookup(target.field);
    if (target.property === 'checked') {
      if (field.kind === 'checkbox' && field.controls.length === 1) {
        this.used.add(name);
        return { t: 'bool', e: { input: field.key } };
      }
      if (field.kind === 'radio' && control) {
        // One radio of a group, reached by its id: checked when that option is chosen.
        this.used.add(name);
        const index = field.controls.indexOf(control);
        return {
          t: 'bool',
          e: { op: 'eq', args: [{ input: field.key }, { str: choiceValue(index) }] },
        };
      }
      throw new Unsupported(`.checked on ${field.kind} "${target.field}"`);
    }
    if (target.property !== 'value')
      throw new Unsupported(`.${target.property} of "${target.field}"`);
    if (control && field.kind === 'radio')
      throw new Unsupported(`.value of one radio "${target.field}"`);
    if (field.kind === 'output') {
      const written = state.outputs.get(name);
      if (!written) throw new Unsupported(`reads result "${name}" before writing it`);
      if (written.t === 'conflict') throw new Unsupported(written.what);
      return written;
    }
    if (field.kind === 'checkbox') throw new Unsupported(`.value of checkbox "${target.field}"`);
    return { t: 'raw', field: name };
  }

  private call(node: CallExpression, state: State): Val {
    const callee = node.callee;
    const args = node.arguments.map((argument) => {
      if (argument.type === 'SpreadElement') throw new Unsupported('spread argument');
      return this.value(argument, state);
    });
    if (callee.type === 'Identifier') {
      if (callee.name === 'f_GetRadioValue') {
        const name = args[0];
        if (args.length !== 1 || name?.t !== 'str' || !('str' in name.e))
          throw new Unsupported('f_GetRadioValue with a computed name');
        const field = this.fields.get(name.e.str);
        if (field?.kind === 'radio') return this.choicePoints(name.e.str, field);
        if (field?.kind === 'checkbox' && field.controls.length === 1) {
          // _scripts.js: the checked element's value × 1, else 0.
          const value = pointsOf(field.controls[0]!.value, `"${name.e.str}"`);
          this.used.add(name.e.str);
          return num(
            { op: 'if', args: [{ input: field.key }, { num: value }, { num: 0 }] },
            Number.isInteger(value),
          );
        }
        throw new Unsupported(
          `f_GetRadioValue("${name.e.str}") has no radio group or single checkbox`,
        );
      }
      if (callee.name === 'parseFloat' || callee.name === 'Number') {
        if (args.length !== 1) throw new Unsupported(`${callee.name} arguments`);
        return this.number(args[0]!, node);
      }
      throw new Unsupported(`call to ${callee.name}() at line ${line(node)}`);
    }
    if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.type === 'Identifier'
    ) {
      const method = callee.property.name;
      if (callee.object.type === 'Identifier' && callee.object.name === 'Math') {
        const numbers = args.map((arg) => this.number(arg, node).e);
        const one = (op: 'sqrt' | 'ln' | 'log10' | 'exp'): Val => {
          if (numbers.length !== 1) throw new Unsupported(`Math.${method} arguments`);
          return num({ op, args: [numbers[0]!] }, false);
        };
        switch (method) {
          case 'sqrt':
            return one('sqrt');
          case 'log':
            return one('ln');
          case 'log10':
            return one('log10');
          case 'exp':
            return one('exp');
          case 'pow':
            if (numbers.length !== 2) throw new Unsupported('Math.pow arguments');
            return num({ op: 'pow', args: [numbers[0]!, numbers[1]!] }, false);
          case 'min':
          case 'max': {
            if (numbers.length < 1) throw new Unsupported(`Math.${method} arguments`);
            const ints = args.every((arg) => arg.t === 'num' && arg.int);
            return num({ op: method, args: numbers }, ints);
          }
          default:
            // round/floor/ceil/abs/trunc have no exact engine operator (Math.round rounds halves
            // up, the engine rounds them away from zero).
            throw new Unsupported(`Math.${method}`);
        }
      }
      if (method === 'toFixed') {
        const subject = this.value(callee.object, state);
        const digits = args[0];
        if (
          args.length !== 1 ||
          digits?.t !== 'num' ||
          !isConst(digits.e) ||
          !Number.isInteger(digits.e.num)
        )
          throw new Unsupported('toFixed with a computed precision');
        const n = this.number(subject, node);
        return { t: 'fixed', e: n.e, int: n.int, digits: digits.e.num };
      }
    }
    throw new Unsupported(`call ${describe(callee)}() at line ${line(node)}`);
  }

  private choicePoints(name: string, field: Field): Val {
    const values = field.controls.map((control) => pointsOf(control.value, `"${name}"`));
    this.used.add(name);
    return num({ points: field.key }, values.every(Number.isInteger));
  }

  /** JS numeric coercion (`x * 1`, `-`, `*`, `/`, comparisons). */
  number(value: Val, node: JsNode | Expression): Extract<Val, { t: 'num' }> {
    switch (value.t) {
      case 'num':
        return value;
      case 'bool':
        return num({ op: 'if', args: [value.e, { num: 1 }, { num: 0 }] }, true) as Extract<
          Val,
          { t: 'num' }
        >;
      case 'raw': {
        const field = this.fields.get(value.field)!;
        this.used.add(value.field);
        if (field.kind === 'number')
          return num({ input: field.key }, false) as Extract<Val, { t: 'num' }>;
        if (field.kind === 'select') {
          const values = field.controls[0]!.options.map((option) =>
            pointsOf(option.value, `"${value.field}"`),
          );
          return num({ points: field.key }, values.every(Number.isInteger)) as Extract<
            Val,
            { t: 'num' }
          >;
        }
        if (field.kind === 'radio')
          return this.choicePoints(value.field, field) as Extract<Val, { t: 'num' }>;
        throw new Unsupported(`numeric use of ${field.kind} "${value.field}"`);
      }
      case 'fixed':
        throw new Unsupported(`toFixed() text reused in a calculation at line ${line(node)}`);
      default:
        throw new Unsupported(`numeric use of a ${value.t} value at line ${line(node)}`);
    }
  }

  /** JS truthiness, only where it is exact. */
  boolean(value: Val, node: JsNode | Expression): Expr {
    if (value.t === 'bool') return value.e;
    if (value.t === 'num') return { op: 'ne', args: [value.e, { num: 0 }] };
    throw new Unsupported(`condition on a ${value.t} value at line ${line(node)}`);
  }

  binary(operator: string, left: Val, right: Val, node: JsNode | Expression): Val {
    if (operator === '+') {
      const texts = [left, right].some(
        (side) => side.t === 'str' || side.t === 'raw' || side.t === 'fixed',
      );
      if (texts) {
        // Only constant text + constant (field names like 'vItem' + i) is exact.
        const part = (side: Val) =>
          side.t === 'str' && 'str' in side.e
            ? side.e.str
            : side.t === 'num' && isConst(side.e)
              ? String(side.e.num)
              : null;
        const a = part(left);
        const b = part(right);
        if (a === null || b === null)
          throw new Unsupported(`text concatenation at line ${line(node)}`);
        return { t: 'str', e: { str: a + b } };
      }
      return this.arithmetic('add', left, right, node);
    }
    if (operator === '-') return this.arithmetic('sub', left, right, node);
    if (operator === '*') return this.arithmetic('mul', left, right, node);
    if (operator === '/') return this.arithmetic('div', left, right, node);
    const comparisons: Record<string, 'lt' | 'le' | 'gt' | 'ge'> = {
      '<': 'lt',
      '<=': 'le',
      '>': 'gt',
      '>=': 'ge',
    };
    if (operator in comparisons) {
      if (left.t === 'raw' && right.t === 'raw')
        throw new Unsupported('text comparison of two fields');
      return {
        t: 'bool',
        e: {
          op: comparisons[operator]!,
          args: [this.number(left, node).e, this.number(right, node).e],
        },
      };
    }
    if (['==', '===', '!=', '!=='].includes(operator)) {
      const op = operator.startsWith('!') ? 'ne' : 'eq';
      const choice = this.choiceComparison(left, right) ?? this.choiceComparison(right, left);
      if (choice) return { t: 'bool', e: op === 'eq' ? choice : { op: 'not', args: [choice] } };
      if (left.t === 'num' && right.t === 'num')
        return { t: 'bool', e: { op, args: [left.e, right.e] } };
      if (operator.length === 2 && (left.t === 'raw' || right.t === 'raw'))
        return {
          t: 'bool',
          e: { op, args: [this.number(left, node).e, this.number(right, node).e] },
        };
      throw new Unsupported(`${operator} between ${left.t} and ${right.t}`);
    }
    throw new Unsupported(`operator ${operator} at line ${line(node)}`);
  }

  /** `select.value == "2"`: true when that option is chosen. */
  private choiceComparison(field: Val, text: Val): Expr | null {
    if (field.t !== 'raw' || text.t !== 'str' || !('str' in text.e)) return null;
    const known = this.fields.get(field.field)!;
    const values =
      known.kind === 'select'
        ? known.controls[0]!.options.map((option) => option.value)
        : known.kind === 'radio'
          ? known.controls.map((control) => control.value ?? '')
          : null;
    if (!values) return null;
    const index = values.indexOf(text.e.str);
    if (index < 0) throw new Unsupported(`"${field.field}" has no option "${text.e.str}"`);
    if (values.indexOf(text.e.str, index + 1) >= 0)
      throw new Unsupported(`"${field.field}" has two options "${text.e.str}"`);
    this.used.add(field.field);
    return { op: 'eq', args: [{ input: known.key }, { str: choiceValue(index) }] };
  }

  private arithmetic(
    op: 'add' | 'sub' | 'mul' | 'div',
    left: Val,
    right: Val,
    node: JsNode | Expression,
  ): Val {
    const a = this.number(left, node);
    const b = this.number(right, node);
    // `x * 1` is JS for « read as a number »: no engine operation needed.
    if (op === 'mul' && isConst(b.e) && b.e.num === 1) return a;
    if (op === 'mul' && isConst(a.e) && a.e.num === 1) return b;
    if (isConst(a.e) && isConst(b.e)) {
      const folded = {
        add: a.e.num + b.e.num,
        sub: a.e.num - b.e.num,
        mul: a.e.num * b.e.num,
        div: a.e.num / b.e.num,
      }[op];
      if (Number.isFinite(folded))
        return num({ num: folded }, Number.isInteger(folded) && op !== 'div');
    }
    if (op === 'add' && 'op' in a.e && a.e.op === 'sum')
      return num({ op: 'sum', args: [...a.e.args, b.e] }, a.int && b.int);
    if (op === 'add' && isConst(a.e) && a.e.num === 0) return b;
    if (op === 'add') return num({ op: 'sum', args: [a.e, b.e] }, a.int && b.int);
    return num({ op, args: [a.e, b.e] }, op !== 'div' && a.int && b.int);
  }

  // ─────────────────────────────── definition ───────────────────────────────

  build(state: State): Translation {
    const notes: string[] = [];
    const results = [...state.outputs.entries()].filter(
      ([, value]) => value.t === 'num' || value.t === 'fixed',
    );
    const texts = [...state.outputs.entries()].filter(([, value]) => value.t === 'str');
    const other = [...state.outputs.entries()].filter(
      ([, value]) => !['num', 'fixed', 'str'].includes(value.t),
    );
    for (const [name, value] of other) {
      throw new Unsupported(
        value.t === 'conflict'
          ? `result "${name}": ${value.what}`
          : `result "${name}" is not a number or a text`,
      );
    }
    if (state.outputs.size === 0)
      throw new NoCalculation('f_Calculer writes no result (reference table)');
    if (results.length === 0) throw new Unsupported('only text results, no number to compute');
    if (results.length > 1)
      throw new Unsupported(
        `${results.length} numeric results (${results.map(([name]) => name).join(', ')}); the engine has one`,
      );
    const [resultName, result] = results[0]! as [string, Extract<Val, { t: 'num' | 'fixed' }>];
    bounded(result.e);
    for (const [, text] of texts) bounded((text as Extract<Val, { t: 'str' }>).e);
    const resultControl = this.fields.get(resultName)!.controls[0]!;

    const interpretation = bands(
      result.e,
      result.int,
      texts.map(([name, value]) => ({
        label: this.fields.get(name)!.controls[0]!.label,
        expr: (value as Extract<Val, { t: 'str' }>).e,
      })),
    );
    if (interpretation.length > 0)
      notes.push(
        'Interpretation bands: severity set to « info » (the source gives none); set the right level.',
      );

    const inputs = this.inputs(notes);
    const decimals = result.t === 'fixed' ? result.digits : result.int ? 0 : null;
    if (decimals === null) notes.push('Result decimals not stated by the source: set to 2.');
    notes.push('English texts copied from French: translate them.');
    notes.push('Limitations are a placeholder: write them from the primary source.');
    notes.push('Add the primary source and test cases before review.');

    const fr = (text: string) => ({ fr: text, en: text });
    const definition = {
      schemaVersion: 1 as const,
      inputs,
      crossFieldRules: [],
      formula: result.e,
      result: {
        unit: (resultControl.unit ?? '').slice(0, 20),
        decimals: Math.min(decimals ?? 2, 6),
        label: fr(resultControl.label || 'Résultat'),
      },
      interpretation: interpretation.map((band) => ({ ...band, label: fr(band.label) })),
      limitations: fr(
        '[À COMPLÉTER] Limites et populations exclues à rédiger depuis la source primaire.',
      ),
    };
    const checked = checkDefinition(definition);
    if (!checked.ok)
      throw new Unsupported(
        `definition rejected by the engine: ${checked.problems.map((p) => `${p.path} ${p.message}`).join('; ')}`,
      );
    return { definition: checked.definition, reviewNotes: notes };
  }

  private inputs(notes: string[]): CalculatorInput[] {
    const inputs: CalculatorInput[] = [];
    const fr = (text: string) => ({ fr: text, en: text });
    for (const [name, field] of this.fields) {
      if (!this.used.has(name)) continue;
      const first = field.controls[0]!;
      if (field.kind === 'radio') {
        if (field.controls.length < 2 || field.controls.length > 20)
          throw new Unsupported(`radio group "${name}" has ${field.controls.length} options`);
        inputs.push({
          kind: 'CHOICE',
          key: field.key,
          label: fr(
            first.heading || field.controls.map((c) => c.label || c.value).join(' / ') || name,
          ),
          required: true,
          choices: field.controls.map((control, index) => {
            const value = Number((control.value ?? '').trim());
            const numeric = field.controls.every(
              (c) => (c.value ?? '').trim() !== '' && Number.isFinite(Number(c.value)),
            );
            return {
              value: choiceValue(index),
              label: fr(control.label || control.value || `${index + 1}`),
              ...(numeric ? { points: value } : {}),
            };
          }),
        });
      } else if (field.kind === 'select') {
        const options = first.options;
        if (options.length < 2 || options.length > 20)
          throw new Unsupported(`list "${name}" has ${options.length} options`);
        const numeric = options.every(
          (option) => Number.isFinite(Number(option.value)) && option.value.trim() !== '',
        );
        inputs.push({
          kind: 'CHOICE',
          key: field.key,
          label: fr(
            first.label ||
              options.map((option) => option.label || option.value).join(' / ') ||
              name,
          ),
          required: true,
          choices: options.map((option, index) => ({
            value: choiceValue(index),
            label: fr(option.label || option.value),
            ...(numeric ? { points: Number(option.value) } : {}),
          })),
        });
      } else if (field.kind === 'checkbox') {
        inputs.push({
          kind: 'BOOLEAN',
          key: field.key,
          label: fr(first.label || first.heading || name),
          required: true,
        });
      } else if (field.kind === 'number') {
        if (!first.unit)
          notes.push(`Input « ${first.label || name} »: no unit on the page, set to « 1 ».`);
        notes.push(
          `Input « ${first.label || name} »: no range on the page; add hard/validated ranges.`,
        );
        inputs.push({
          kind: 'NUMBER',
          key: field.key,
          label: fr(first.label || name),
          required: true,
          quantity: quantityFor(field.key),
          canonicalUnit: (first.unit ?? '1').slice(0, 20),
          units: [],
          decimals: 2,
        });
      }
    }
    if (inputs.length === 0) throw new Unsupported('the result uses no input');
    for (const input of inputs) {
      if (input.label.fr === input.key)
        notes.push(`Input « ${input.key} »: no label on the page; write one.`);
    }
    return inputs;
  }
}

const quantityFor = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/^[^A-Z]+/, '')
    .slice(0, 40)
    .padEnd(2, 'X');

// ──────────────────────────────── merging ────────────────────────────────

function clone(state: State): State {
  return { vars: new Map(state.vars), outputs: new Map(state.outputs) };
}

function merge(condition: Expr, whenTrue: Env, whenFalse: Env): Env {
  const merged: Env = new Map();
  for (const name of new Set([...whenTrue.keys(), ...whenFalse.keys()])) {
    const a = whenTrue.get(name) ?? { t: 'undef' as const };
    const b = whenFalse.get(name) ?? { t: 'undef' as const };
    let value: Val;
    try {
      value = same(a, b) ? a : mergeValue(condition, a, b, `"${name}"`);
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      value = { t: 'conflict', what: error.message };
    }
    merged.set(name, value);
  }
  return merged;
}

const same = (a: Val, b: Val) => {
  if ('e' in a) bounded(a.e);
  if ('e' in b) bounded(b.e);
  return canonicalJson(a) === canonicalJson(b);
};

function mergeValue(condition: Expr, a: Val, b: Val, what: string): Val {
  const asText = (v: Val): Expr | null =>
    v.t === 'str' ? v.e : v.t === 'undef' ? { str: UNDEFINED_TEXT } : null;
  if ('e' in a) bounded(a.e);
  if ('e' in b) bounded(b.e);
  if (a.t === 'num' && b.t === 'num')
    return num({ op: 'if', args: [condition, a.e, b.e] }, a.int && b.int);
  if (a.t === 'fixed' && b.t === 'fixed' && a.digits === b.digits)
    return {
      t: 'fixed',
      e: { op: 'if', args: [condition, a.e, b.e] },
      int: a.int && b.int,
      digits: a.digits,
    };
  if (a.t === 'bool' && b.t === 'bool')
    return { t: 'bool', e: { op: 'if', args: [condition, a.e, b.e] } };
  const textA = asText(a);
  const textB = asText(b);
  if (textA && textB) return { t: 'str', e: { op: 'if', args: [condition, textA, textB] } };
  throw new Unsupported(`${what} is ${a.t} on one branch and ${b.t} on the other`);
}

// ─────────────────────────────── bands ───────────────────────────────

interface Region {
  lo: number;
  hi: number;
  /** A single point `lo === hi`, or the open interval between them. */
  point: boolean;
}

/**
 * Turns text results chosen by conditions on the main result into interpretation bands
 * `from ≤ value < to`. Conditions must compare the result with constants. When the result is
 * provably an integer, strict and non-strict bounds convert exactly; otherwise a bound that
 * belongs to the wrong side has no exact band form and the translation stops.
 */
export type ImportedBand = Omit<InterpretationBand, 'label'> & { label: string };

export function bands(
  formula: Expr,
  integer: boolean,
  texts: { label: string; expr: Expr }[],
): ImportedBand[] {
  if (texts.length === 0) return [];
  const target = canonicalJson(formula);
  const constants = new Set<number>();
  const collect = (e: Expr) => {
    if ('op' in e) {
      if (['lt', 'le', 'gt', 'ge', 'eq', 'ne'].includes(e.op)) {
        const [left, right] = (e as { args: [Expr, Expr] }).args;
        const k =
          canonicalJson(left) === target && isConst(right)
            ? right.num
            : canonicalJson(right) === target && isConst(left)
              ? left.num
              : null;
        if (k === null)
          throw new Unsupported('a text result depends on something other than the result');
        constants.add(k);
        return;
      }
      if ('args' in e) (e.args as Expr[]).forEach(collect);
      if (e.op === 'piecewise') throw new Unsupported('piecewise text');
    }
  };
  texts.forEach((text) => collect(text.expr));
  const points = [...constants].sort((a, b) => a - b);
  const regions: Region[] = [];
  let previous = -Infinity;
  for (const k of points) {
    regions.push({ lo: previous, hi: k, point: false }, { lo: k, hi: k, point: true });
    previous = k;
  }
  regions.push({ lo: previous, hi: Infinity, point: false });

  const sample = (region: Region) =>
    region.point
      ? region.lo
      : Number.isFinite(region.lo) && Number.isFinite(region.hi)
        ? (region.lo + region.hi) / 2
        : Number.isFinite(region.lo)
          ? region.lo + 1
          : Number.isFinite(region.hi)
            ? region.hi - 1
            : 0;
  const condition = (e: Expr, x: number): boolean => {
    if ('bool' in e) return e.bool;
    if (!('op' in e)) throw new Unsupported('condition form');
    const args = (e as { args: Expr[] }).args;
    const side = (a: Expr) => (canonicalJson(a) === target ? x : isConst(a) ? a.num : Number.NaN);
    switch (e.op) {
      case 'lt':
        return side(args[0]!) < side(args[1]!);
      case 'le':
        return side(args[0]!) <= side(args[1]!);
      case 'gt':
        return side(args[0]!) > side(args[1]!);
      case 'ge':
        return side(args[0]!) >= side(args[1]!);
      case 'eq':
        return side(args[0]!) === side(args[1]!);
      case 'ne':
        return side(args[0]!) !== side(args[1]!);
      case 'and':
        return args.every((a) => condition(a, x));
      case 'or':
        return args.some((a) => condition(a, x));
      case 'not':
        return !condition(args[0]!, x);
      default:
        throw new Unsupported(`condition operator ${e.op}`);
    }
  };
  const text = (e: Expr, x: number): string => {
    if ('str' in e) return e.str;
    if ('op' in e && e.op === 'if') {
      const [c, a, b] = e.args;
      return condition(c, x) ? text(a, x) : text(b, x);
    }
    throw new Unsupported('text result form');
  };

  // Label of each region: the texts it shows; adjacent regions with the same label merge.
  const labelled = regions.map((region) => {
    const x = sample(region);
    const shown = texts
      .map(({ label, expr }) => ({ label, value: text(expr, x) }))
      .filter(({ value }) => value !== UNDEFINED_TEXT && value.trim() !== '');
    const label =
      shown.length === 0
        ? null
        : shown
            .map(({ label: caption, value }) =>
              caption ? `${caption} : ${value.trim()}` : value.trim(),
            )
            .join(' · ');
    return { region, label };
  });

  const runs: {
    lo: number;
    loClosed: boolean;
    hi: number;
    hiClosed: boolean;
    label: string | null;
  }[] = [];
  for (const { region, label } of labelled) {
    const last = runs.at(-1);
    if (last && last.label === label) {
      last.hi = region.hi;
      last.hiClosed = region.point;
    } else {
      runs.push({
        lo: region.lo,
        loClosed: region.point,
        hi: region.hi,
        hiClosed: region.point,
        label,
      });
    }
  }

  const out: ImportedBand[] = [];
  for (const run of runs) {
    if (run.label === null) continue;
    let from: number | undefined;
    let to: number | undefined;
    if (integer) {
      if (Number.isFinite(run.lo)) from = run.loClosed ? Math.ceil(run.lo) : Math.floor(run.lo) + 1;
      if (Number.isFinite(run.hi)) to = run.hiClosed ? Math.floor(run.hi) + 1 : Math.ceil(run.hi);
      if (from !== undefined && to !== undefined && from >= to) continue;
    } else {
      if (Number.isFinite(run.lo)) {
        if (!run.loClosed)
          throw new Unsupported(`band « ${run.label} » excludes its lower bound ${run.lo}`);
        from = run.lo;
      }
      if (Number.isFinite(run.hi)) {
        if (run.hiClosed)
          throw new Unsupported(`band « ${run.label} » includes its upper bound ${run.hi}`);
        to = run.hi;
      }
    }
    out.push({
      code: `BAND_${out.length + 1}`,
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      severity: 'info',
      label: run.label,
    });
  }
  if (out.length > 20)
    throw new Unsupported(`${out.length} interpretation bands; the engine allows 20`);
  return out;
}

// ─────────────────────────────── helpers ───────────────────────────────

/** `document.Form.<field>.<property>` or `document.getElementById('<id>')` is not supported. */
function formProperty(node: MemberExpression): { field: string; property: string } | null {
  if (node.computed || node.property.type !== 'Identifier') return null;
  const property = node.property.name;
  const object = node.object;
  if (
    object.type !== 'MemberExpression' ||
    object.computed ||
    object.property.type !== 'Identifier'
  )
    return null;
  const form = object.object;
  if (
    form.type === 'MemberExpression' &&
    !form.computed &&
    form.object.type === 'Identifier' &&
    form.object.name === 'document' &&
    form.property.type === 'Identifier' &&
    form.property.name === 'Form'
  )
    return { field: object.property.name, property };
  return null;
}

function mathConstant(node: MemberExpression): number | null {
  if (node.computed || node.object.type !== 'Identifier' || node.object.name !== 'Math')
    return null;
  if (node.property.type !== 'Identifier') return null;
  const constants: Record<string, number> = {
    PI: Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
  };
  return constants[node.property.name] ?? null;
}

function isAndroidBridge(node: CallExpression): boolean {
  return (
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'MSSAndroidFunction'
  );
}

function literalNumber(node: Expression): number | null {
  return node.type === 'Literal' && typeof node.value === 'number' ? node.value : null;
}

function compoundOperator(operator: string): string {
  const map: Record<string, string> = { '+=': '+', '-=': '-', '*=': '*', '/=': '/' };
  const binary = map[operator];
  if (!binary) throw new Unsupported(`operator ${operator}`);
  return binary;
}

function describe(node: JsNode | Expression): string {
  if (node.type === 'Identifier') return (node as { name: string }).name;
  if (node.type === 'MemberExpression') {
    const member = node as MemberExpression;
    const property = member.property.type === 'Identifier' ? member.property.name : '[…]';
    return `${describe(member.object)}.${property}`;
  }
  if (node.type === 'CallExpression') return `${describe((node as CallExpression).callee)}()`;
  return node.type;
}

function line(node: JsNode | Expression): number {
  return (node as { loc?: { start: { line: number } } }).loc?.start.line ?? 0;
}
