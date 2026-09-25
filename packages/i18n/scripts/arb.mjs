// Compiles the `common.*` and `mobile.*` messages into ARB files for Flutter gen-l10n.
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';

export const ARB_NAMESPACES = ['common', 'mobile'];

/** "mobile.settings.appearance.title" → "settingsAppearanceTitle"; "common.appName" → "appName". */
export function arbKey(key) {
  const [, ...rest] = key.split('.');
  return rest
    .map((segment, index) =>
      index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1),
    )
    .join('');
}

const PLACEHOLDER_TYPES = {
  [TYPE.argument]: 'String',
  [TYPE.select]: 'String',
  [TYPE.number]: 'num',
  [TYPE.plural]: 'num',
  [TYPE.date]: 'DateTime',
  [TYPE.time]: 'DateTime',
};

/** Placeholders of a message with their Dart types, for the "@key" metadata gen-l10n needs. */
export function placeholders(message) {
  const found = {};
  const walk = (elements) => {
    for (const element of elements) {
      const type = PLACEHOLDER_TYPES[element.type];
      if (type) found[element.value] = { type };
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        for (const option of Object.values(element.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return found;
}

/**
 * ARB document for one locale. Keys come out sorted so the files are stable; a collision after
 * dropping the namespace is an error.
 */
export function renderArb(locale, catalogue) {
  const arb = { '@@locale': locale };
  const origin = new Map();
  for (const key of Object.keys(catalogue).sort()) {
    const [namespace] = key.split('.');
    if (!ARB_NAMESPACES.includes(namespace)) continue;
    const name = arbKey(key);
    if (origin.has(name))
      throw new Error(`ARB key "${name}" comes from both ${origin.get(name)} and ${key}`);
    origin.set(name, key);
    arb[name] = catalogue[key];
    const args = placeholders(catalogue[key]);
    arb[`@${name}`] =
      Object.keys(args).length > 0
        ? { description: key, placeholders: args }
        : { description: key };
  }
  return `${JSON.stringify(arb, null, 2)}\n`;
}
