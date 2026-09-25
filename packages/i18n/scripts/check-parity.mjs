// CI gate: the FR and EN catalogues must be valid ICU and describe exactly the same messages, and
// the generated Flutter ARB files must match them.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ARB_DIRECTORY, renderAllArb } from './build-arb.mjs';
import { compareCatalogues, validateCatalogue } from './catalogue.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

async function load(locale) {
  const raw = await readFile(`${root}/messages.${locale}.json`, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`messages.${locale}.json is not valid JSON: ${error.message}`);
  }
}

const fr = await load('fr');
const en = await load('en');
const problems = [
  ...validateCatalogue('fr', fr),
  ...validateCatalogue('en', en),
  ...compareCatalogues(fr, en),
];

if (problems.length === 0) {
  for (const [name, expected] of Object.entries(await renderAllArb())) {
    const committed = await readFile(`${ARB_DIRECTORY}${name}`, 'utf8').catch(() => '');
    if (committed.replace(/\r\n/g, '\n') !== expected) {
      problems.push(
        `apps/mobile/lib/src/l10n/arb/${name} is stale: run "npm run build:arb -w @doktool/i18n"`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `i18n check passed: ${Object.keys(fr).length} keys in fr and en; ARB files up to date.`,
);
