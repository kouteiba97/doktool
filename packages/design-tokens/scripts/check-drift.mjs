// CI gate: every generated token output must match design/system/tokens.json.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { findDrift, loadTailwindPreset } from './drift.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const designDir = path.join(repoRoot, 'design');
const outputsDir = path.join(designDir, 'tokens');

const [sourceText, css, tailwindCode, dart] = await Promise.all([
  readFile(path.join(designDir, 'system', 'tokens.json'), 'utf8'),
  readFile(path.join(outputsDir, 'tokens.css'), 'utf8'),
  readFile(path.join(outputsDir, 'tailwind.preset.js'), 'utf8'),
  readFile(path.join(outputsDir, 'doktool_tokens.dart'), 'utf8'),
]);
// Node strips TypeScript types natively, so the TS output is imported as-is.
const ts = await import(pathToFileURL(path.join(outputsDir, 'tokens.ts')).href);

const problems = findDrift({
  source: JSON.parse(sourceText),
  css,
  ts,
  tailwind: loadTailwindPreset(tailwindCode),
  dart,
});

if (problems.length > 0) {
  console.error(`Design-token drift (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('Design tokens: CSS, Tailwind, TS and Dart outputs match tokens.json.');
