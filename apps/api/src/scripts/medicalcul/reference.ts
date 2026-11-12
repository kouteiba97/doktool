// Runs a Medicalcul page's own f_Calculer() on given answers, to obtain the value Medicalcul
// itself shows. Used only by the publication script, on the extraction machine, to write test
// cases whose expected value comes from the source and not from DokTool's engine. Medicalcul's
// code never runs in the app, the API or Admin Web (docs/medicalcul-integration/integration.md).
import vm from 'node:vm';
import type { CalculatorDefinition, EvaluationInputs } from '../../modules/calculators/index.js';
import { keyFor } from './logic.js';
import type { PageControl, ParsedPage } from './page.js';

/** A form control as the page script sees it. */
interface FakeElement {
  name: string;
  id: string | null;
  type: string;
  value: string;
  checked: boolean;
  selectedIndex: number;
  options: { value: string; text: string; selected: boolean }[];
  style: Record<string, string>;
  innerHTML: string;
  disabled: boolean;
  /** Set when the script assigns `.value` (result fields). */
  written: boolean;
}

/** One field of the page (radios of one name, or a single control), with its engine key. */
interface FormField {
  kind: PageControl['kind'];
  key: string;
  elements: FakeElement[];
}

/** What the page shows after « Calculer ». */
export interface ReferenceRun {
  /** Result fields the script wrote, by form field name. */
  outputs: Map<string, { label: string; unit: string | null; value: string }>;
}

/** Thrown when the page script cannot be run for these answers. */
export class ReferenceFailure extends Error {}

/** An element with no behaviour, for ids the script touches only to show or hide text. */
const inert = (): FakeElement => ({
  name: '',
  id: null,
  type: 'inert',
  value: '',
  checked: false,
  selectedIndex: 0,
  options: [],
  style: {},
  innerHTML: '',
  disabled: false,
  written: false,
});

/** Builds the page's form: fields in page order, keyed exactly as the translator keys them. */
function buildForm(page: ParsedPage): Map<string, FormField> {
  const fields = new Map<string, FormField>();
  const taken = new Set<string>();
  for (const control of page.controls) {
    const element: FakeElement = {
      ...inert(),
      name: control.name,
      id: control.id,
      type: control.kind,
      value: control.kind === 'radio' || control.kind === 'checkbox' ? (control.value ?? 'on') : '',
      options: control.options.map((option, index) => ({
        value: option.value,
        text: option.label,
        selected: index === 0,
      })),
    };
    if (control.kind === 'select') element.value = control.options[0]?.value ?? '';
    const existing = fields.get(control.name);
    if (existing) existing.elements.push(element);
    else
      fields.set(control.name, {
        kind: control.kind,
        key: keyFor(control.name, taken),
        elements: [element],
      });
  }
  return fields;
}

/** Puts the answers of a DokTool evaluation into the page's form. */
function fill(
  fields: Map<string, FormField>,
  definition: CalculatorDefinition,
  inputs: EvaluationInputs,
): void {
  const byKey = new Map([...fields.values()].map((field) => [field.key, field]));
  for (const input of definition.inputs) {
    const field = byKey.get(input.key);
    const given = inputs[input.key]?.value;
    if (!field) throw new ReferenceFailure(`no form field for input ${input.key}`);
    if (given === undefined || given === null) continue;
    if (input.kind === 'CHOICE') {
      const index = input.choices.findIndex((choice) => choice.value === given);
      if (index < 0) throw new ReferenceFailure(`unknown choice for ${input.key}`);
      if (field.kind === 'select') {
        const element = field.elements[0]!;
        element.selectedIndex = index;
        element.options.forEach((option, at) => (option.selected = at === index));
        element.value = element.options[index]!.value;
      } else {
        field.elements.forEach((element, at) => (element.checked = at === index));
      }
    } else if (input.kind === 'BOOLEAN') {
      field.elements[0]!.checked = given === true;
    } else {
      field.elements[0]!.value = String(given);
    }
  }
}

/** The DOM surface the page scripts use: `document.Form.<name|id>`, getElementById, a few lists. */
function documentFor(fields: Map<string, FormField>) {
  const byId = new Map<string, FakeElement>();
  for (const field of fields.values())
    for (const element of field.elements) if (element.id) byId.set(element.id, element);
  const extras = new Map<string, FakeElement>();

  /** Makes `.value =` on a result field observable, and `.value` of a radio list readable. */
  const observed = (element: FakeElement) =>
    new Proxy(element, {
      set(target, property, value) {
        if (property === 'value') {
          target.value = String(value);
          target.written = true;
          return true;
        }
        return Reflect.set(target, property, value);
      },
      get(target, property) {
        if (property === 'valueAsNumber')
          return target.value === '' ? Number.NaN : Number(target.value);
        return Reflect.get(target, property) as unknown;
      },
    });

  const lookup = (name: string): unknown => {
    const field = fields.get(name);
    if (field) {
      if (field.elements.length === 1) return observed(field.elements[0]!);
      // A radio group: an indexable list that also answers `.value` with the checked radio.
      const list = field.elements.map(observed) as unknown as FakeElement[] & { value: string };
      Object.defineProperty(list, 'value', {
        get: () => field.elements.find((element) => element.checked)?.value ?? '',
      });
      return list;
    }
    const single = byId.get(name);
    if (single) return observed(single);
    if (!extras.has(name)) extras.set(name, inert());
    return observed(extras.get(name)!);
  };

  const form = new Proxy(
    {},
    { get: (_, property) => (typeof property === 'string' ? lookup(property) : undefined) },
  );
  return {
    Form: form,
    forms: new Proxy({}, { get: () => form }),
    getElementById: (id: string) => {
      const element = byId.get(id);
      if (element) return observed(element);
      return lookup(id);
    },
    getElementsByName: (name: string) => {
      const found = lookup(name);
      return (Array.isArray(found) ? found : [found]) as unknown[];
    },
    write: () => undefined,
    writeln: () => undefined,
    cookie: '',
    location: { href: 'file:///medicalcul/page.html', pathname: '/medicalcul/page.html' },
  };
}

/**
 * Runs the page's f_Calculer() with the answers of `inputs` and returns what it wrote in its
 * result fields. `sharedScript` is Medicalcul's `_scripts.js` (helpers some pages call).
 */
export function runReference(
  page: ParsedPage,
  sharedScript: string,
  definition: CalculatorDefinition,
  inputs: EvaluationInputs,
): ReferenceRun {
  const fields = buildForm(page);
  fill(fields, definition, inputs);
  const document = documentFor(fields);
  const sandbox: Record<string, unknown> = {
    document,
    navigator: { userAgent: 'doktool-reference', language: 'fr' },
    location: document.location,
    alert: () => undefined,
    confirm: () => true,
    console: { log: () => undefined, error: () => undefined, warn: () => undefined },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  const run = (code: string, required: boolean) => {
    try {
      vm.runInContext(code, context, { timeout: 2000 });
    } catch (error) {
      if (required) throw new ReferenceFailure(`page script failed: ${(error as Error).message}`);
    }
  };
  // Shared helpers and page scripts may touch things a browser has and this sandbox lacks while
  // loading; only the calculation itself has to succeed.
  run(sharedScript, false);
  for (const script of page.scripts) run(script, false);
  run('f_Calculer();', true);

  const outputs: ReferenceRun['outputs'] = new Map();
  for (const control of page.controls) {
    if (control.kind !== 'output') continue;
    const element = fields.get(control.name)?.elements[0];
    if (element?.written)
      outputs.set(control.name, { label: control.label, unit: control.unit, value: element.value });
  }
  return { outputs };
}
