// Pure comparison logic between tokens.json and its generated outputs.
import vm from 'node:vm';

const SCALAR_CATEGORIES = [
  'spacing',
  'radius',
  'blur',
  'opacity',
  'border',
  'duration',
  'easing',
  'breakpoint',
  'zIndex',
  'size',
];

/** Dart classes whose members are the token name without its category prefix, camelCased. */
const DART_SCALAR_CLASSES = {
  radius: { className: 'DtRadius', prefix: 'radius-' },
  blur: { className: 'DtBlur', prefix: 'blur-' },
  opacity: { className: 'DtOpacity', prefix: 'opacity-' },
  border: { className: 'DtBorder', prefix: 'border-' },
  size: { className: 'DtSize', prefix: 'size-' },
};

const REFERENCE = /^\{([a-z0-9-]+)\}$/;

/** "on-navy-subtle" → "onNavySubtle", "viz-3" → "viz3". */
export function camelCase(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

const normalise = (value) => String(value).replace(/\s+/g, '').toLowerCase();

/**
 * Colour and shadow tokens per theme, with the resolved value and the reference (if any).
 * @returns {{ name: string, theme: 'light'|'dark', value: string, ref: string|null }[]}
 */
export function themedTokens(source) {
  const colours = source.color.tokens;
  const byName = new Map(colours.map((t) => [t.name, t]));
  const resolve = (name, theme, seen = new Set()) => {
    if (seen.has(name)) throw new Error(`circular colour reference at "${name}"`);
    const token = byName.get(name);
    if (!token) throw new Error(`unknown colour reference "{${name}}"`);
    const value = token.value[theme];
    const match = REFERENCE.exec(value);
    return match ? resolve(match[1], theme, new Set([...seen, name])) : value;
  };

  const entries = [];
  for (const token of [...colours, ...source.shadow.tokens]) {
    for (const theme of ['light', 'dark']) {
      const raw = token.value[theme];
      const match = REFERENCE.exec(raw);
      entries.push({
        name: token.name,
        theme,
        value: match ? resolve(match[1], theme) : raw,
        ref: match ? match[1] : null,
      });
    }
  }
  return entries;
}

/** @returns {{ category: string, name: string, value: string }[]} */
export function scalarTokens(source) {
  return SCALAR_CATEGORIES.flatMap((category) =>
    source[category].tokens.map((t) => ({ category, name: t.name, value: String(t.value) })),
  );
}

/**
 * Parses top-level CSS rules into custom-property maps per theme. Nested at-rules are rejected so
 * the check can never silently read a media-scoped value as the default.
 */
export function parseCssCustomProperties(css) {
  const light = new Map();
  const dark = new Map();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('{', index);
    if (open === -1) break;
    const close = text.indexOf('}', open);
    if (close === -1) throw new Error('unbalanced braces in tokens.css');
    const body = text.slice(open + 1, close);
    if (body.includes('{')) {
      throw new Error('nested CSS blocks are not supported by the drift check');
    }
    const selector = text.slice(index, open).trim();
    index = close + 1;
    if (selector.startsWith('@font-face')) continue;
    const target = selector.includes('[data-theme="dark"]')
      ? dark
      : selector.includes(':root') || selector.includes('[data-theme="light"]')
        ? light
        : null;
    if (!target) continue;
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon === -1) continue;
      const property = declaration.slice(0, colon).trim();
      if (property.startsWith('--')) {
        target.set(property.slice(2), declaration.slice(colon + 1).trim());
      }
    }
  }
  return { light, dark };
}

/** Evaluates the CommonJS Tailwind preset in an isolated context. */
export function loadTailwindPreset(code) {
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(code, sandbox, { filename: 'tailwind.preset.js' });
  return sandbox.module.exports;
}

/** "#0a5c78" → "FF0A5C78"; "rgba(255,255,255,0.78)" → "C7FFFFFF". */
export function toDartArgb(colour) {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  if (hex) return `FF${hex[1].toUpperCase()}`;
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(colour);
  if (rgba) {
    const [r, g, b] = rgba.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0'));
    const alpha = Math.round(Number(rgba[4]) * 255)
      .toString(16)
      .padStart(2, '0');
    return `${alpha}${r}${g}${b}`.toUpperCase();
  }
  throw new Error(`unsupported colour format "${colour}"`);
}

function dartClassBody(dart, className) {
  const start = dart.search(new RegExp(`abstract final class ${className} \\{`));
  if (start === -1) return null;
  const end = dart.indexOf('\n}', start);
  return dart.slice(start, end === -1 ? undefined : end);
}

/** Reads `name: Color(0xAARRGGBB)` pairs from `static const light|dark = DtColors(...)`. */
export function parseDartColours(dart, theme) {
  const start = dart.indexOf(`static const ${theme} = DtColors(`);
  if (start === -1) return new Map();
  const block = dart.slice(start, dart.indexOf(');', start));
  return new Map(
    [...block.matchAll(/(\w+):\s*Color\(0x([0-9A-Fa-f]{8})\)/g)].map((m) => [
      m[1],
      m[2].toUpperCase(),
    ]),
  );
}

/** Reads `static const double name = value;` members of an abstract final class. */
export function parseDartDoubles(dart, className) {
  const body = dartClassBody(dart, className);
  if (body === null) return null;
  return new Map(
    [...body.matchAll(/static const double (\w+) = ([\d.]+);/g)].map((m) => [m[1], Number(m[2])]),
  );
}

/** Reads `static const Duration name = Duration(milliseconds: n);` from DtMotion. */
export function parseDartDurations(dart) {
  const body = dartClassBody(dart, 'DtMotion');
  if (body === null) return null;
  return new Map(
    [...body.matchAll(/static const Duration (\w+) = Duration\(milliseconds: (\d+)\);/g)].map(
      (m) => [m[1], Number(m[2])],
    ),
  );
}

function compare(problems, label, actual, expected) {
  if (actual === undefined) problems.push(`${label} is missing`);
  else if (normalise(actual) !== normalise(expected)) {
    problems.push(`${label} is "${actual}", tokens.json says "${expected}"`);
  }
}

/**
 * Runs every comparison and returns human-readable problems (empty = no drift).
 * @param {{ source: object, css: string, ts: Record<string, any>, tailwind: any, dart: string }} inputs
 */
export function findDrift({ source, css, ts, tailwind, dart }) {
  const problems = [];
  const themed = themedTokens(source);
  const scalars = scalarTokens(source);
  const cssVars = parseCssCustomProperties(css);

  // CSS: themed values (references stay var(--ref)); scalars live in :root.
  for (const { name, theme, value, ref } of themed) {
    const expected = ref ? `var(--${ref})` : value;
    compare(problems, `tokens.css [${theme}] --${name}`, cssVars[theme].get(name), expected);
  }
  for (const { name, value } of scalars) {
    compare(problems, `tokens.css --${name}`, cssVars.light.get(name), value);
  }

  // TS: themed values are resolved; scalars are grouped by category.
  for (const { name, theme, value } of themed) {
    compare(problems, `tokens.ts themes.${theme}["${name}"]`, ts.themes?.[theme]?.[name], value);
  }
  for (const { category, name, value } of scalars) {
    compare(problems, `tokens.ts ${category}["${name}"]`, ts[category]?.[name], value);
  }

  // Tailwind: every colour goes through its CSS variable.
  for (const token of source.color.tokens) {
    const actual = tailwind?.theme?.colors?.[token.name];
    if (actual !== `var(--${token.name})`) {
      problems.push(
        `tailwind.preset.js colors["${token.name}"] must be "var(--${token.name})", got "${actual}"`,
      );
    }
  }

  // Dart: colours per theme (references resolved), scalar classes, motion durations.
  for (const theme of ['light', 'dark']) {
    const colours = parseDartColours(dart, theme);
    for (const entry of themed.filter((t) => t.theme === theme && !t.name.startsWith('shadow-'))) {
      const member = camelCase(entry.name);
      const actual = colours.get(member);
      const expected = toDartArgb(entry.value);
      if (actual === undefined) {
        problems.push(`doktool_tokens.dart DtColors.${theme}.${member} is missing`);
      } else if (actual !== expected) {
        problems.push(
          `doktool_tokens.dart DtColors.${theme}.${member} is 0x${actual}, tokens.json gives 0x${expected}`,
        );
      }
    }
  }
  for (const [category, { className, prefix }] of Object.entries(DART_SCALAR_CLASSES)) {
    const members = parseDartDoubles(dart, className);
    if (members === null) {
      problems.push(`doktool_tokens.dart class ${className} is missing`);
      continue;
    }
    for (const { name, value } of scalars.filter((s) => s.category === category)) {
      const member = camelCase(name.slice(prefix.length));
      if (members.get(member) !== Number.parseFloat(value)) {
        problems.push(
          `doktool_tokens.dart ${className}.${member} is ${members.get(member)}, tokens.json says ${value}`,
        );
      }
    }
  }
  const durations = parseDartDurations(dart);
  if (durations === null) {
    problems.push('doktool_tokens.dart class DtMotion is missing');
  } else {
    for (const { name, value } of scalars.filter((s) => s.category === 'duration')) {
      const member = camelCase(name.slice('duration-'.length));
      if (durations.get(member) !== Number.parseFloat(value)) {
        problems.push(
          `doktool_tokens.dart DtMotion.${member} is ${durations.get(member)}ms, tokens.json says ${value}`,
        );
      }
    }
  }

  return problems;
}
