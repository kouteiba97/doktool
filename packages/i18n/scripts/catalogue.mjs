// Pure validation logic for the FR/EN catalogues. Used by check-parity.mjs and its tests.
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';

/** Keys must live in one of the three namespaces, dot-separated camelCase segments. */
export const KEY_PATTERN = /^(common|mobile|admin)(\.[a-z][A-Za-z0-9]*)+$/;

const NAMED_TYPES = new Set([
  TYPE.argument,
  TYPE.number,
  TYPE.date,
  TYPE.time,
  TYPE.select,
  TYPE.plural,
  TYPE.tag,
]);

/**
 * Collects every ICU argument name (and rich-text tag name) used by a message.
 * @param {import('@formatjs/icu-messageformat-parser').MessageFormatElement[]} elements
 * @param {Set<string>} into
 * @returns {Set<string>}
 */
function collectArguments(elements, into = new Set()) {
  for (const element of elements) {
    if (NAMED_TYPES.has(element.type)) into.add(element.value);
    if (element.type === TYPE.select || element.type === TYPE.plural) {
      for (const option of Object.values(element.options)) collectArguments(option.value, into);
    }
    if (element.type === TYPE.tag) collectArguments(element.children, into);
  }
  return into;
}

/**
 * @param {string} message
 * @returns {{ ok: true, args: string[] } | { ok: false, error: string }}
 */
export function analyseMessage(message) {
  try {
    const args = [...collectArguments(parse(message))].sort();
    return { ok: true, args };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Validates one catalogue's shape.
 * @param {string} locale
 * @param {unknown} catalogue
 * @returns {string[]} problems
 */
export function validateCatalogue(locale, catalogue) {
  if (catalogue === null || typeof catalogue !== 'object' || Array.isArray(catalogue)) {
    return [`${locale}: catalogue must be a flat JSON object`];
  }
  const problems = [];
  for (const [key, value] of Object.entries(catalogue)) {
    if (!KEY_PATTERN.test(key)) {
      problems.push(`${locale}: key "${key}" must match ${KEY_PATTERN}`);
    }
    if (typeof value !== 'string') {
      problems.push(`${locale}: "${key}" must be a string`);
      continue;
    }
    if (value.trim() === '') problems.push(`${locale}: "${key}" is empty`);
    const analysis = analyseMessage(value);
    if (!analysis.ok) problems.push(`${locale}: "${key}" is not valid ICU — ${analysis.error}`);
  }
  return problems;
}

/**
 * Compares the FR and EN catalogues: same keys, same ICU arguments per key.
 * @param {Record<string, string>} fr
 * @param {Record<string, string>} en
 * @returns {string[]} problems
 */
export function compareCatalogues(fr, en) {
  const problems = [];
  const frKeys = new Set(Object.keys(fr));
  const enKeys = new Set(Object.keys(en));
  for (const key of frKeys) if (!enKeys.has(key)) problems.push(`missing in en: "${key}"`);
  for (const key of enKeys) if (!frKeys.has(key)) problems.push(`missing in fr: "${key}"`);

  for (const key of frKeys) {
    if (!enKeys.has(key) || typeof fr[key] !== 'string' || typeof en[key] !== 'string') continue;
    const a = analyseMessage(fr[key]);
    const b = analyseMessage(en[key]);
    if (!a.ok || !b.ok) continue;
    if (a.args.join('|') !== b.args.join('|')) {
      problems.push(
        `"${key}" uses different arguments — fr {${a.args.join(', ')}} vs en {${b.args.join(', ')}}`,
      );
    }
  }
  return problems;
}
