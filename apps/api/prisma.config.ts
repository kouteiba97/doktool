import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not read .env by itself. Load it when present (local development); CI and
// production provide DATABASE_URL through the environment.
if (existsSync('.env')) process.loadEnvFile('.env');

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` and `prisma validate` need no database; migrate commands fail clearly without it.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
