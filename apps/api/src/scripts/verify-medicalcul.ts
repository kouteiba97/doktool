// Dry check, no database: for every importable Medicalcul calculator, completes the draft and
// compares DokTool's engine with Medicalcul's own page on a set of answers.
//
//   npm run medicalcul:verify -w @doktool/api -- --raw <unzipped archive> [--only id,id]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkDefinition } from '../modules/calculators/index.js';
import { catalogueSchema } from './medicalcul/catalogue.js';
import { completeDefinition, NotVerifiable, referenceCases } from './medicalcul/complete.js';
import { parsePage } from './medicalcul/page.js';

const { values } = parseArgs({
  options: {
    raw: { type: 'string' },
    file: { type: 'string', default: '../../docs/medicalcul-integration/catalogue.json' },
    only: { type: 'string' },
  },
});
if (!values.raw) {
  console.error('Usage: --raw <unzipped Medicalcul archive> [--file <catalogue.json>] [--only id]');
  process.exit(2);
}
const catalogue = catalogueSchema.parse(
  JSON.parse(readFileSync(path.resolve(values.file), 'utf8')),
);
const only = values.only ? new Set(values.only.split(',').map((id) => id.trim())) : null;
const shared = readFileSync(path.join(values.raw, '_scripts.js'), 'latin1');

let verified = 0;
const refused: string[] = [];
for (const entry of catalogue.calculators) {
  if (!entry.import || !entry.definition || (only && !only.has(entry.id))) continue;
  try {
    const checked = checkDefinition(completeDefinition(entry.definition));
    if (!checked.ok) throw new NotVerifiable(checked.problems.map((p) => p.message).join('; '));
    const page = parsePage(readFileSync(path.join(values.raw, entry.sourceFile), 'utf8'));
    const cases = referenceCases(page, shared, checked.definition, entry.id);
    verified++;
    if (only) console.log(entry.id, JSON.stringify(cases.map((c) => c.expectedValue)));
  } catch (error) {
    if (!(error instanceof NotVerifiable)) throw error;
    refused.push(`${entry.id}: ${error.message}`);
  }
}
console.log(`${verified} calculator(s) agree with Medicalcul's pages; ${refused.length} refused.`);
for (const line of refused) console.log(`  ${line}`);
