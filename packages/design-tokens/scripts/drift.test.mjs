import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  camelCase,
  findDrift,
  loadTailwindPreset,
  parseCssCustomProperties,
  themedTokens,
  toDartArgb,
} from './drift.mjs';

const source = {
  color: {
    tokens: [
      { name: 'brand', value: { light: '#0a5c78', dark: '#56afcf' } },
      { name: 'trace', value: { light: '{brand}', dark: '{brand}' } },
      { name: 'glass', value: { light: 'rgba(255,255,255,0.78)', dark: 'rgba(18,31,43,0.74)' } },
    ],
  },
  shadow: { tokens: [{ name: 'shadow-sm', value: { light: '0 1px 2px #000', dark: 'none' } }] },
  spacing: { tokens: [{ name: 'space-1', value: '4px' }] },
  radius: { tokens: [{ name: 'radius-sm', value: '6px' }] },
  blur: { tokens: [] },
  opacity: { tokens: [] },
  border: { tokens: [] },
  duration: { tokens: [{ name: 'duration-fast', value: '120ms' }] },
  easing: { tokens: [] },
  breakpoint: { tokens: [] },
  zIndex: { tokens: [] },
  size: { tokens: [] },
};

const css = `
@font-face{font-family:"Inter";src:url("x.woff2")}
:root, [data-theme="light"] { --brand: #0a5c78; --trace: var(--brand); --glass: rgba(255,255,255,0.78); --shadow-sm: 0 1px 2px #000; }
[data-theme="dark"] { --brand: #56afcf; --trace: var(--brand); --glass: rgba(18,31,43,0.74); --shadow-sm: none; }
:root { --space-1: 4px; --radius-sm: 6px; --duration-fast: 120ms; }`;

const ts = {
  themes: {
    light: {
      brand: '#0a5c78',
      trace: '#0a5c78',
      glass: 'rgba(255,255,255,0.78)',
      'shadow-sm': '0 1px 2px #000',
    },
    dark: { brand: '#56afcf', trace: '#56afcf', glass: 'rgba(18,31,43,0.74)', 'shadow-sm': 'none' },
  },
  spacing: { 'space-1': '4px' },
  radius: { 'radius-sm': '6px' },
  blur: {},
  opacity: {},
  border: {},
  duration: { 'duration-fast': '120ms' },
  easing: {},
  breakpoint: {},
  zIndex: {},
  size: {},
};

const presetCode = (brand) =>
  `module.exports = { theme: { colors: { brand: "${brand}", trace: "var(--trace)", glass: "var(--glass)" } } };`;
const tailwind = loadTailwindPreset(presetCode('var(--brand)'));

const dart = `
  static const light = DtColors(
    brand: Color(0xFF0A5C78),
    trace: Color(0xFF0A5C78),
    glass: Color(0xC7FFFFFF),
  );
  static const dark = DtColors(
    brand: Color(0xFF56AFCF),
    trace: Color(0xFF56AFCF),
    glass: Color(0xBD121F2B),
  );
abstract final class DtRadius {
  static const double sm = 6.0;
}
abstract final class DtBlur {
}
abstract final class DtOpacity {
}
abstract final class DtBorder {
}
abstract final class DtSize {
}
abstract final class DtMotion {
  static const Duration fast = Duration(milliseconds: 120);
}
`;

describe('helpers', () => {
  it('camelCases token names', () => {
    assert.equal(camelCase('on-navy-subtle'), 'onNavySubtle');
    assert.equal(camelCase('viz-3'), 'viz3');
  });

  it('converts CSS colours to Dart ARGB', () => {
    assert.equal(toDartArgb('#0a5c78'), 'FF0A5C78');
    assert.equal(toDartArgb('rgba(255,255,255,0.78)'), 'C7FFFFFF');
    assert.throws(() => toDartArgb('hsl(0 0% 0%)'));
  });

  it('resolves colour references', () => {
    const trace = themedTokens(source).find((t) => t.name === 'trace' && t.theme === 'dark');
    assert.deepEqual(trace, { name: 'trace', theme: 'dark', value: '#56afcf', ref: 'brand' });
  });

  it('refuses nested CSS blocks', () => {
    assert.throws(() => parseCssCustomProperties('@media (x) { :root { --a: 1; } }'));
  });
});

describe('findDrift', () => {
  it('passes when every output matches', () => {
    assert.deepEqual(findDrift({ source, css, ts, tailwind, dart }), []);
  });

  it('reports a changed CSS colour', () => {
    const drifted = css.replace('#56afcf', '#56afce');
    const problems = findDrift({ source, css: drifted, ts, tailwind, dart });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /tokens\.css \[dark\] --brand/);
  });

  it('reports a changed Dart colour and a changed Dart duration', () => {
    const drifted = dart
      .replace('0xBD121F2B', '0xBE121F2B')
      .replace('milliseconds: 120', 'milliseconds: 150');
    assert.equal(findDrift({ source, css, ts, tailwind, dart: drifted }).length, 2);
  });

  it('reports a Tailwind colour that bypasses the CSS variable', () => {
    const raw = loadTailwindPreset(presetCode('#0a5c78'));
    assert.equal(findDrift({ source, css, ts, tailwind: raw, dart }).length, 1);
  });

  it('reports a missing TS scalar', () => {
    const problems = findDrift({ source, css, ts: { ...ts, radius: {} }, tailwind, dart });
    assert.deepEqual(problems, ['tokens.ts radius["radius-sm"] is missing']);
  });
});

describe('generated Flutter theme', () => {
  it('uses valid Dart identifiers and covers every colour in both themes', async () => {
    const { generateDart } = await import('./dart-generator.mjs');
    const tokens = JSON.parse(
      await readFile(new URL('../../../design/system/tokens.json', import.meta.url), 'utf8'),
    );
    const dart = generateDart(tokens);
    assert.doesNotMatch(dart, /static const (double|Duration|Curve|TextStyle) [0-9]/);
    assert.match(dart, /static const double s4 = 16.0;/);
    for (const token of tokens.color.tokens) {
      const member = token.name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      assert.match(dart, new RegExp(`final Color ${member};`));
    }
  });
});
