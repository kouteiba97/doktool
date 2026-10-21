// Adds, replaces or removes messages in both catalogues at once, keeping keys sorted:
//
//   npm run add-keys -w @doktool/i18n -- path/to/keys.json
//
// keys.json: { "fr": { "mobile.x.y": "…" }, "en": { "mobile.x.y": "…" }, "remove": ["mobile.old"] }
// Both languages must receive the same keys. Then run `npm run build:arb -w @doktool/i18n` and
// `flutter gen-l10n` in apps/mobile.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const input = process.argv[2];
if (!input) {
  console.error('Usage: add-keys <keys.json>');
  process.exit(2);
}
const changes = JSON.parse(await readFile(path.resolve(process.cwd(), input), 'utf8'));
const fr = Object.keys(changes.fr ?? {}).sort();
const en = Object.keys(changes.en ?? {}).sort();
if (JSON.stringify(fr) !== JSON.stringify(en)) {
  console.error('fr and en must contain the same keys.');
  process.exit(1);
}

for (const locale of ['fr', 'en']) {
  const file = path.join(packageRoot, `messages.${locale}.json`);
  const catalogue = JSON.parse(await readFile(file, 'utf8'));
  for (const key of changes.remove ?? []) delete catalogue[key];
  Object.assign(catalogue, changes[locale] ?? {});
  const sorted = Object.fromEntries(
    Object.keys(catalogue)
      .sort()
      .map((key) => [key, catalogue[key]]),
  );
  await writeFile(file, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}
console.log(`ok ${fr.length} added or replaced, ${(changes.remove ?? []).length} removed`);
