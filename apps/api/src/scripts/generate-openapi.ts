// Writes the OpenAPI contract to packages/api-contract/openapi.json.
// Nest logging is disabled for the preview app, so this script reports with console.
// `--check` compares instead of writing and exits 1 when the committed contract is stale (CI).
import 'reflect-metadata';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadEnv } from '../config/env.js';
import { buildOpenApiDocument } from '../openapi/document.js';

const contractPath = fileURLToPath(
  new URL('../../../../packages/api-contract/openapi.json', import.meta.url),
);

/** Recursively sorts object keys so the file is byte-stable across runs and machines. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

// Preview mode resolves the module graph and controller metadata without instantiating providers,
// so no database connection is attempted and the values below (never secrets) are never used.
const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://openapi-generation.invalid/doktool',
  USER_JWT_SECRET: 'openapi-generation-placeholder-secret-000000',
  OTP_HMAC_SECRET: 'openapi-generation-placeholder-secret-000000',
  ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  ADMIN_WEB_ORIGIN: 'https://admin.invalid',
  TERMS_VERSION: 'openapi',
  JOBS_ENABLED: 'false',
});
const app = await NestFactory.create(AppModule.forRoot(env), { preview: true, logger: false });
const document = buildOpenApiDocument(app);
await app.close();

// Nest omits `required` when no property is required. Generators then disagree (swagger_parser
// treats every property as required), so the contract states the empty list explicitly.
for (const schema of Object.values(document.components?.schemas ?? {})) {
  if ('properties' in schema && schema.properties && !schema.required) schema.required = [];
}

const serialised = `${JSON.stringify(sortKeys(document), null, 2)}\n`;

if (process.argv.includes('--check')) {
  const committed = await readFile(contractPath, 'utf8').catch(() => '');
  if (committed.replace(/\r\n/g, '\n') !== serialised) {
    console.error(
      'packages/api-contract/openapi.json is out of date. Run `npm run openapi:generate -w @doktool/api` and commit.',
    );
    process.exit(1);
  }
  console.log('packages/api-contract/openapi.json is up to date.');
} else {
  await writeFile(contractPath, serialised, 'utf8');
  console.log(`Wrote ${contractPath}`);
}
