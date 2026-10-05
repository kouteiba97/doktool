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
 * The message as Flutter gen-l10n reads it. gen-l10n does not know the ICU `#` shorthand of plural
 * branches and would print it as is (« # modèles »): each `#` becomes the plural's own argument.
 */
export function toFlutterMessage(message) {
  const pounds = [];
  const walk = (elements, plural) => {
    for (const element of elements) {
      if (element.type === TYPE.pound && plural) {
        pounds.push({
          start: element.location.start.offset,
          end: element.location.end.offset,
          plural,
        });
      }
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        const scope = element.type === TYPE.plural ? element.value : plural;
        for (const option of Object.values(element.options)) walk(option.value, scope);
      }
    }
  };
  walk(parse(message, { captureLocation: true }), null);
  let result = message;
  for (const pound of pounds.sort((a, b) => b.start - a.start)) {
    result = `${result.slice(0, pound.start)}{${pound.plural}}${result.slice(pound.end)}`;
  }
  return result;
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
    arb[name] = toFlutterMessage(catalogue[key]);
    const args = placeholders(catalogue[key]);
    arb[`@${name}`] =
      Object.keys(args).length > 0
        ? { description: key, placeholders: args }
        : { description: key };
  }
  return `${JSON.stringify(arb, null, 2)}\n`;
}
