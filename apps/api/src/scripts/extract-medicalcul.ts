// Builds the Medicalcul catalogue from the app's own data archive, unzipped (never executed):
//
//   npm run medicalcul:extract -w @doktool/api -- --raw <unzipped archive dir> [--check]
//
// Reads docs/medicalcul-integration/source.json (where the archive came from, its checksums) and
// writes catalogue.json, catalogue.schema.json and coverage.csv next to it. The output depends only
// on the archive files: a second run gives identical bytes; --check fails if it would not.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildCatalogue,
  catalogueJsonSchema,
  coverageCsv,
  sourceSchema,
} from './medicalcul/catalogue.js';

const { values } = parseArgs({
  options: {
    raw: { type: 'string' },
    out: { type: 'string', default: '../../docs/medicalcul-integration' },
    check: { type: 'boolean', default: false },
  },
});
if (!values.raw) {
  console.error('Usage: --raw <unzipped Medicalcul archive> [--out <dir>] [--check]');
  process.exit(2);
}

const raw = path.resolve(values.raw);
const out = path.resolve(values.out);
const source = sourceSchema.parse(JSON.parse(readFileSync(path.join(out, 'source.json'), 'utf8')));

// Calculator pages: every page at the root except the indexes and the start pages.
const files = readdirSync(raw)
  .filter((file) => file.endsWith('.html') && !/^(_index|index)/.test(file))
  .sort();
const index = readFileSync(path.join(raw, '_indexalpha.html'), 'utf8');
const indexed = new Set(
  [...index.matchAll(/href="([A-Za-z0-9_.-]+\.html)"/g)].map((match) => match[1]!),
);
const catalogue = buildCatalogue(
  source,
  files.map((file) => ({ file, bytes: readFileSync(path.join(raw, file)) })),
  indexed,
);

const outputs: Record<string, string> = {
  'catalogue.json': `${JSON.stringify(catalogue, null, 2)}\n`,
  'catalogue.schema.json': `${JSON.stringify(catalogueJsonSchema(), null, 2)}\n`,
  'coverage.csv': coverageCsv(catalogue),
};

if (values.check) {
  const stale = Object.entries(outputs).filter(([name, content]) => {
    try {
      return readFileSync(path.join(out, name), 'utf8') !== content;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([name]) => name).join(', ')}`);
    process.exit(1);
  }
  console.log('Catalogue is up to date.');
} else {
  for (const [name, content] of Object.entries(outputs))
    writeFileSync(path.join(out, name), content);
  console.log(JSON.stringify(catalogue.counts));
}
