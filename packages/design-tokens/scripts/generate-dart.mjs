// Writes apps/mobile/lib/src/theme/doktool_tokens.dart from design/system/tokens.json.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDart } from './dart-generator.mjs';

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const DART_OUTPUT = path.join(
  repoRoot,
  'apps',
  'mobile',
  'lib',
  'src',
  'theme',
  'doktool_tokens.dart',
);

export async function renderDart() {
  const source = JSON.parse(
    await readFile(path.join(repoRoot, 'design', 'system', 'tokens.json'), 'utf8'),
  );
  return generateDart(source);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await writeFile(DART_OUTPUT, await renderDart(), 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, DART_OUTPUT)}`);
}
