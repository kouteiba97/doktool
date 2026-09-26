// CI gate: every generated token output must match design/system/tokens.json.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { findDrift, loadTailwindPreset } from './drift.mjs';
import { DART_OUTPUT, renderDart } from './generate-dart.mjs';
import { WEB_CSS, WEB_PRESET, renderWeb } from './generate-web.mjs';

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

// The Flutter token file is generated: it must match what tokens.json produces today.
const committedDart = await readFile(DART_OUTPUT, 'utf8').catch(() => '');
if (committedDart.replace(/\r\n/g, '\n') !== (await renderDart())) {
  problems.push(
    'apps/mobile/lib/src/theme/doktool_tokens.dart is stale: run `npm run generate:dart -w @doktool/design-tokens`',
  );
}

// The Admin Web outputs (ESM preset, stylesheet) are generated too.
const web = await renderWeb();
for (const [file, expected] of [
  [WEB_PRESET, web.presetModule],
  [WEB_CSS, web.webCss],
]) {
  const committed = await readFile(file, 'utf8').catch(() => '');
  if (committed.replace(/\r\n/g, '\n') !== expected) {
    problems.push(
      `packages/design-tokens/web/${path.basename(file)} is stale: run \`npm run generate:web -w @doktool/design-tokens\``,
    );
  }
}

if (problems.length > 0) {
  console.error(`Design-token drift (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  'Design tokens: CSS, Tailwind, TS, Dart, the Flutter theme and the Admin Web outputs match tokens.json.',
);
