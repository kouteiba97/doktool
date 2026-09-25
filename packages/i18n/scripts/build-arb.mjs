// Writes apps/mobile/lib/src/l10n/arb/app_{fr,en}.arb from the catalogues (gen-l10n input).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderArb } from './arb.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
export const ARB_DIRECTORY = fileURLToPath(
  new URL('../../../apps/mobile/lib/src/l10n/arb/', import.meta.url),
);
export const LOCALES = ['fr', 'en'];

export async function renderAllArb() {
  const files = {};
  for (const locale of LOCALES) {
    const catalogue = JSON.parse(
      await readFile(path.join(packageRoot, `messages.${locale}.json`), 'utf8'),
    );
    files[`app_${locale}.arb`] = renderArb(locale, catalogue);
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await mkdir(ARB_DIRECTORY, { recursive: true });
  for (const [name, content] of Object.entries(await renderAllArb())) {
    await writeFile(path.join(ARB_DIRECTORY, name), content, 'utf8');
    console.log(`Wrote apps/mobile/lib/src/l10n/arb/${name}`);
  }
}
