// CI gate: the FR and EN catalogues must be valid ICU and describe exactly the same messages.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`i18n check passed: ${Object.keys(fr).length} keys in fr and en.`);
