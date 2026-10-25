// Imports the calculators the Medicalcul extraction translated exactly, as DRAFTS authored by an
// admin who holds `calculators.draft`. Nothing is published: a reviewer checks each draft in Admin
// Web, adds the primary source and test cases, and publishes it (author ≠ reviewer).
//
//   npm run medicalcul:import -w @doktool/api -- --author editor@example.dz [--only abcd2,apgar] [--dry-run]
//
// Calculators whose slug already exists are skipped, so a second run imports only what is new.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadEnv } from '../config/env.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { AdminAccountsService, type AdminPrincipal } from '../modules/admin-auth/index.js';
import { CalculatorsAdminService } from '../modules/calculators/index.js';
import { catalogueSchema } from './medicalcul/catalogue.js';

const { values } = parseArgs({
  options: {
    author: { type: 'string' },
    file: { type: 'string', default: '../../docs/medicalcul-integration/catalogue.json' },
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.author) {
  console.error(
    'Usage: --author <admin e-mail> [--file <catalogue.json>] [--only id,id] [--dry-run]',
  );
  process.exit(2);
}

const catalogue = catalogueSchema.parse(
  JSON.parse(readFileSync(path.resolve(values.file), 'utf8')),
);
const only = values.only ? new Set(values.only.split(',').map((id) => id.trim())) : null;
const candidates = catalogue.calculators.filter(
  (entry) => entry.import && entry.definition && (!only || only.has(entry.id)),
);
if (only) {
  const unknown = [...only].filter((id) => !candidates.some((entry) => entry.id === id));
  if (unknown.length > 0) {
    console.error(`Not importable (see coverage.csv): ${unknown.join(', ')}`);
    process.exit(2);
  }
}

const env = { ...loadEnv(process.env), JOBS_ENABLED: false };
const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
  logger: ['error'],
});
try {
  const prisma = app.get(PrismaService);
  const account = await prisma.adminAccount.findUnique({
    where: { email: values.author.trim().toLowerCase() },
  });
  if (!account || account.status !== 'ACTIVE') throw new Error('No active admin with this e-mail.');
  const grants = await app.get(AdminAccountsService).effectiveGrants(account.id);
  if (!grants.includes('calculators.draft')) {
    throw new Error('The author needs the calculators.draft grant (Calculator editor).');
  }
  const author: AdminPrincipal = {
    adminId: account.id,
    sessionId: 'medicalcul-import',
    email: account.email,
    fullName: account.fullName,
    grants,
  };
  const client = { ip: null, userAgent: 'medicalcul-import' };
  const calculators = app.get(CalculatorsAdminService);
  const reason =
    `Import Medicalcul (données ${catalogue.source.descriptor.dataVersion}, ` +
    `archive sha256 ${catalogue.source.archive.sha256.slice(0, 12)}…) — brouillon à vérifier.`;

  let created = 0;
  let skipped = 0;
  for (const entry of candidates) {
    const { slug, nameFr, category } = entry.import!;
    if (await prisma.calculator.findUnique({ where: { slug } })) {
      skipped++;
      continue;
    }
    if (values['dry-run']) {
      console.log(`would import ${slug}`);
      created++;
      continue;
    }
    const calculator = await calculators.createCalculator(
      author,
      {
        slug,
        nameFr,
        nameEn: nameFr,
        purposeFr: null,
        purposeEn: null,
        category,
        accessTier: 'STUDENT',
        demoSample: false,
        reason: `${reason} Source : ${entry.sourceFile} (${entry.sourceSha256.slice(0, 12)}…).`,
      },
      client,
    );
    await calculators.createVersion(
      author,
      calculator.id,
      { definition: entry.definition },
      client,
    );
    created++;
  }
  console.log(
    `${values['dry-run'] ? 'Dry run: ' : ''}${created} draft(s) ${values['dry-run'] ? 'to create' : 'created'}, ` +
      `${skipped} already present, out of ${candidates.length} importable calculator(s).`,
  );
  console.log(
    'Next: in Admin Web › Calculateurs, review each draft, add its primary source and test cases.',
  );
} finally {
  await app.close();
}
