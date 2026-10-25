// Reads one Medicalcul calculator page (HTML) into plain data: title, specialty, form controls,
// result fields, references and the inline scripts as text. Nothing on the page is executed.
import { type DefaultTreeAdapterMap, parse } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export type ControlKind = 'radio' | 'checkbox' | 'number' | 'select' | 'output';

export interface PageControl {
  kind: ControlKind;
  /** The form field name the page script reads (`document.Form.<name>`). */
  name: string;
  id: string | null;
  /** Radio and checkbox `value` attribute, as written. */
  value: string | null;
  /** Label text shown next to the control (radio/checkbox label, field label, result label). */
  label: string;
  /** Last bold heading above the control: the question of a radio group. */
  heading: string | null;
  /** Text right after the field in the same cell, e.g. « kg », « mmol/l ». */
  unit: string | null;
  options: { value: string; label: string }[];
}

export interface ParsedPage {
  title: string;
  /** From the specialty icon `zzimgspe_<code>.png`. */
  specialty: string | null;
  /** Specialty as worded in the page title (« … ~ Neurologie »). */
  specialtyLabel: string | null;
  /** Inline `<script>` bodies (shared `_scripts.js` is referenced, not inlined). */
  scripts: string[];
  scriptSources: string[];
  controls: PageControl[];
  hasInterpretation: boolean;
  references: string[];
}

const isElement = (node: Node): node is Element => 'tagName' in node;
const attr = (element: Element, name: string) =>
  element.attrs.find((candidate) => candidate.name === name)?.value ?? null;
const hasClass = (element: Element, name: string) =>
  (attr(element, 'class') ?? '').split(/\s+/).includes(name);

/** Text of a subtree, whitespace (including no-break spaces) collapsed. */
export function textOf(node: Node): string {
  return collapse(rawText(node));
}

function rawText(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  if (!('childNodes' in node)) return '';
  if (isElement(node) && (node.tagName === 'script' || node.tagName === 'style')) return '';
  if (isElement(node) && node.tagName === 'br') return '\n';
  return node.childNodes.map(rawText).join('');
}

// JS \s already covers the no-break spaces Medicalcul writes as &nbsp;.
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

function* walk(node: Node): Generator<Node> {
  yield node;
  if ('childNodes' in node) for (const child of node.childNodes) yield* walk(child);
  if (isElement(node) && node.tagName === 'template') {
    yield* walk((node as DefaultTreeAdapterMap['template']).content);
  }
}

function elements(root: Node, tagName: string): Element[] {
  const found: Element[] = [];
  for (const node of walk(root)) if (isElement(node) && node.tagName === tagName) found.push(node);
  return found;
}

/** Lines of a paragraph split on `<br>`, without its leading caption (« Références: »). */
function lines(element: Element): string[] {
  return rawText(element)
    .split('\n')
    .map(collapse)
    .filter((line) => line.length > 0)
    .filter((line, index) => !(index === 0 && /:$/.test(line)));
}

/** Text that follows `node` inside its parent, up to the next form control. */
function trailingText(node: Element): string | null {
  const parent = node.parentNode;
  if (!parent || !('childNodes' in parent)) return null;
  const siblings = parent.childNodes;
  let text = '';
  for (const sibling of siblings.slice(siblings.indexOf(node) + 1)) {
    if (isElement(sibling) && ['input', 'select', 'br', 'label'].includes(sibling.tagName)) break;
    text += rawText(sibling);
  }
  const unit = collapse(text);
  return unit.length > 0 ? unit : null;
}

/** Text before `node` inside its parent (result captions: « Score : <input> »). */
function leadingText(node: Element): string {
  const parent = node.parentNode;
  if (!parent || !('childNodes' in parent)) return '';
  const siblings = parent.childNodes;
  let text = '';
  for (const sibling of siblings.slice(0, siblings.indexOf(node))) {
    if (isElement(sibling) && ['input', 'select', 'br'].includes(sibling.tagName)) text = '';
    else text += rawText(sibling);
  }
  return collapse(text).replace(/\s*:$/, '');
}

export function parsePage(html: string): ParsedPage {
  const document = parse(html);
  const labels = new Map<string, string>();
  for (const label of elements(document, 'label')) {
    const target = attr(label, 'for');
    if (target) labels.set(target, textOf(label).replace(/\s*:$/, ''));
  }

  const titleText = textOf(elements(document, 'title')[0] ?? document);
  const [name = titleText, specialtyLabel = null] = titleText
    .replace(/^Medicalcul\s*-\s*/, '')
    .split(/\s+~\s+/);
  const icon = elements(document, 'img')
    .map((img) => attr(img, 'src') ?? '')
    .find((src) => /^zzimgspe_[a-z_]+\.png$/.test(src));

  const scripts: string[] = [];
  const scriptSources: string[] = [];
  for (const script of elements(document, 'script')) {
    const src = attr(script, 'src');
    if (src) scriptSources.push(src);
    else
      scripts.push(
        script.childNodes
          .map((child) =>
            child.nodeName === '#text' ? (child as DefaultTreeAdapterMap['textNode']).value : '',
          )
          .join(''),
      );
  }

  const controls: PageControl[] = [];
  let heading: string | null = null;
  /** The radio group that already took the current heading: a heading names one question. */
  let headingUsedBy: string | null = null;
  for (const node of walk(document)) {
    if (!isElement(node)) continue;
    if ((node.tagName === 'strong' || node.tagName === 'b') && !insideLabel(node)) {
      const text = cleanHeading(textOf(node));
      if (text) {
        heading = text;
        headingUsedBy = null;
      }
      continue;
    }
    // A full-width cell without any field is the question above the next options.
    if (node.tagName === 'td' && attr(node, 'colspan') && !hasField(node)) {
      const text = cleanHeading(textOf(node));
      if (text) {
        heading = text;
        headingUsedBy = null;
      }
      continue;
    }
    if (node.tagName === 'select') {
      const fieldName = attr(node, 'name') ?? attr(node, 'id');
      if (!fieldName) continue;
      controls.push({
        kind: 'select',
        name: fieldName,
        id: attr(node, 'id'),
        value: null,
        label: labels.get(attr(node, 'id') ?? fieldName) ?? rowLabel(node) ?? '',
        heading,
        unit: trailingText(node),
        options: elements(node, 'option').map((option) => ({
          value: attr(option, 'value') ?? textOf(option),
          label: textOf(option),
        })),
      });
      continue;
    }
    if (node.tagName !== 'input') continue;
    const type = (attr(node, 'type') ?? 'text').toLowerCase();
    const fieldName = attr(node, 'name') ?? attr(node, 'id');
    if (!fieldName || type === 'button' || type === 'submit' || type === 'hidden') continue;
    const id = attr(node, 'id');
    const readonly = node.attrs.some((candidate) => candidate.name === 'readonly');
    if (type === 'radio' || type === 'checkbox') {
      let question = heading;
      if (type === 'radio') {
        if (headingUsedBy !== null && headingUsedBy !== fieldName) question = null;
        else headingUsedBy = fieldName;
      }
      controls.push({
        kind: type,
        name: fieldName,
        id,
        value: attr(node, 'value'),
        label: labels.get(id ?? '') ?? '',
        heading: question,
        unit: null,
        options: [],
      });
    } else if (readonly) {
      controls.push({
        kind: 'output',
        name: fieldName,
        id,
        value: null,
        label: leadingText(node),
        heading: null,
        unit: trailingText(node),
        options: [],
      });
    } else {
      controls.push({
        kind: 'number',
        name: fieldName,
        id,
        value: null,
        label: labels.get(id ?? fieldName) ?? rowLabel(node) ?? '',
        heading,
        unit: trailingText(node),
        options: [],
      });
    }
  }

  const paragraphs = elements(document, 'p');
  return {
    title: name.trim(),
    specialty: icon ? icon.replace(/^zzimgspe_/, '').replace(/\.png$/, '') : null,
    specialtyLabel: specialtyLabel?.trim() || null,
    scripts,
    scriptSources,
    controls,
    hasInterpretation: paragraphs.some((p) => hasClass(p, 'score_inter')),
    references: paragraphs.filter((p) => hasClass(p, 'score_ref')).flatMap(lines),
  };
}

const cleanHeading = (text: string) =>
  text
    .replace(/^[•\s]+/, '')
    .replace(/\s*:$/, '')
    .trim();

function hasField(element: Element): boolean {
  for (const node of walk(element)) {
    if (isElement(node) && ['input', 'select', 'label', 'textarea'].includes(node.tagName))
      return true;
  }
  return false;
}

/** Caption in the cell before the field's cell, on the same table row (« Tranche d'âge : »). */
function rowLabel(element: Element): string | null {
  let cell: Node | null = element.parentNode;
  while (cell && !(isElement(cell) && cell.tagName === 'td')) {
    cell = 'parentNode' in cell ? cell.parentNode : null;
  }
  if (!cell || !isElement(cell) || !cell.parentNode) return null;
  const row = cell.parentNode.childNodes.filter(
    (child): child is Element => isElement(child as Node) && (child as Element).tagName === 'td',
  );
  const before = row.slice(0, row.indexOf(cell)).reverse();
  for (const previous of before) {
    if (hasField(previous)) return null;
    const text = cleanHeading(textOf(previous));
    if (text) return text;
  }
  return null;
}

function insideLabel(element: Element): boolean {
  for (let node = element.parentNode; node; node = 'parentNode' in node ? node.parentNode : null) {
    if (isElement(node) && node.tagName === 'label') return true;
  }
  return false;
}
