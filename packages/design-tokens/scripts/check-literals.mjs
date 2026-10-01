// CI gate: no raw colour, radius, blur or motion-duration literal in the Flutter app or Admin Web.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DART_RULES, WEB_RULES, findLiterals, isScanned } from './literals.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const roots = ['apps/mobile/lib', 'apps/admin/src'];

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const problems = [];
let scanned = 0;
for (const root of roots) {
  for await (const file of walk(path.join(repoRoot, root))) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/');
    if (!isScanned(relative)) continue;
    scanned += 1;
    const rules = relative.endsWith('.dart') ? DART_RULES : WEB_RULES;
    for (const hit of findLiterals(await readFile(file, 'utf8'), rules)) {
      problems.push(`${relative}:${hit.line} raw ${hit.kind} — use a design token: ${hit.text}`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`No raw colour, radius, blur or duration literal in ${scanned} client files.`);
