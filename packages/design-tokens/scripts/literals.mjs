// Raw design values in client code (Lock L19, CLAUDE.md): colours, radii, blurs and motion durations
// come from the tokens — `DtColors`/`DtRadius`/`DtBlur`/`DtMotion` in Flutter, the Tailwind preset
// and `var(--…)` on Admin Web — never from a literal typed in a widget or a class name.

/** @typedef {{ kind: 'colour' | 'radius' | 'blur' | 'duration', pattern: RegExp }} Rule */

/** @type {Rule[]} */
export const DART_RULES = [
  { kind: 'colour', pattern: /\bColor\(\s*0x/ },
  { kind: 'colour', pattern: /\bColor\.from(?:ARGB|RGBO)\(/ },
  // Colors.transparent is the absence of a colour, not a value.
  { kind: 'colour', pattern: /\bColors\.(?!transparent\b)[a-zA-Z]/ },
  { kind: 'radius', pattern: /\b(?:Border)?Radius\.(?:circular|elliptical)\(\s*[\d.]/ },
  { kind: 'blur', pattern: /\bImageFilter\.blur\([^)]*sigma[XY]\s*:\s*[\d.]/ },
  { kind: 'blur', pattern: /\bblurRadius\s*:\s*[\d.]/ },
  {
    kind: 'duration',
    pattern:
      /\b(?:duration|reverseDuration|transitionDuration|reverseTransitionDuration|animationDuration)\s*:\s*(?:const\s+)?Duration\(/,
  },
];

/** @type {Rule[]} */
export const WEB_RULES = [
  { kind: 'colour', pattern: /(?:^|[\s:,(['"`])#[0-9a-fA-F]{3,8}\b(?![-\w])/ },
  { kind: 'colour', pattern: /\b(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/ },
  {
    kind: 'colour',
    pattern: /\b(?:bg|text|border|ring|fill|stroke|outline|shadow|from|to|via)-\[(?:#|rgb|hsl)/,
  },
  { kind: 'radius', pattern: /\bborder(?:-[a-z]+)*-radius\s*:\s*[\d.]+(?:px|rem|em)\b/ },
  { kind: 'radius', pattern: /\brounded(?:-[a-z]+)?-\[/ },
  { kind: 'blur', pattern: /\bblur\(\s*[\d.]+(?:px|rem|em)\s*\)/ },
  { kind: 'blur', pattern: /\b(?:backdrop-)?blur-(?:\[|(?:xs|sm|md|lg|xl|2xl|3xl)\b)/ },
  {
    kind: 'duration',
    pattern: /\b(?:transition|animation)(?:-duration|-delay)?\s*:[^;]*?\b\d+(?:\.\d+)?m?s\b/,
  },
  { kind: 'duration', pattern: /\b(?:duration|delay)-(?:\[|\d)/ },
];

/** Lines that are only a comment are not code. */
function isComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

/**
 * The raw design values in one file.
 * @param {string} text
 * @param {Rule[]} rules
 * @returns {{ line: number, kind: Rule['kind'], text: string }[]}
 */
export function findLiterals(text, rules) {
  const found = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (isComment(line)) return;
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        found.push({ line: index + 1, kind: rule.kind, text: line.trim() });
        break;
      }
    }
  });
  return found;
}

/** Generated files and the token outputs themselves are where the values live. */
export function isScanned(relativePath) {
  const file = relativePath.replaceAll('\\', '/');
  if (file.startsWith('apps/mobile/lib/')) {
    return (
      file.endsWith('.dart') &&
      !file.endsWith('.g.dart') &&
      !file.includes('/generated/') &&
      file !== 'apps/mobile/lib/src/theme/doktool_tokens.dart'
    );
  }
  if (file.startsWith('apps/admin/src/')) {
    return /\.(?:tsx?|css)$/.test(file) && file !== 'apps/admin/src/api/schema.d.ts';
  }
  return false;
}
