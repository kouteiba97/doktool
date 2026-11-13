// Publishes the imported Medicalcul drafts (Product Owner decision of 12 November 2026, with the
// author's permission). For each draft still exactly as imported:
//   1. the author completes it mechanically (entry limits, limitations text) — no formula changes;
//   2. Medicalcul's page is recorded as its primary source, with the references the page cites;
//   3. test cases are written from the values Medicalcul's own page computes; a calculator whose
//      DokTool result differs from the page on any answer set is left as a draft;
//   4. the author submits, and one or two other admins review and publish (author ≠ reviewer and
//      the review policy stay enforced by the same service Admin Web uses).
//
//   npm run medicalcul:publish -w @doktool/api -- --raw <unzipped archive> \
//     --author editor@example.dz --reviewer reviewer@example.dz[,second@example.dz] [--only id,id] [--dry-run]
//
// Run it again at any time: published calculators and drafts someone edited by hand are skipped.
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
import { checkDefinition, definitionSha256 } from '../modules/calculators/index.js';
import { catalogueSchema } from './medicalcul/catalogue.js';
import { completeDefinition, NotVerifiable, referenceCases } from './medicalcul/complete.js';
import { parsePage } from './medicalcul/page.js';

const { values } = parseArgs({
  options: {
    raw: { type: 'string' },
    author: { type: 'string' },
    reviewer: { type: 'string' },
    file: { type: 'string', default: '../../docs/medicalcul-integration/catalogue.json' },
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.raw || !values.author || !values.reviewer) {
  console.error(
    'Usage: --raw <unzipped Medicalcul archive> --author <admin e-mail> --reviewer <e-mail>[,<e-mail>] [--only id,id] [--dry-run]',
  );
  process.exit(2);
}

const catalogue = catalogueSchema.parse(
  JSON.parse(readFileSync(path.resolve(values.file), 'utf8')),
);
const only = values.only ? new Set(values.only.split(',').map((id) => id.trim())) : null;
const shared = readFileSync(path.join(values.raw, '_scripts.js'), 'latin1');
const dataVersion = catalogue.source.descriptor.dataVersion;
const site = catalogue.source.servers[0]!;
const today = new Date();

const env = { ...loadEnv(process.env), JOBS_ENABLED: false };
const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
  logger: ['error'],
});
try {
  const prisma = app.get(PrismaService);
  const accounts = app.get(AdminAccountsService);
  const calculators = app.get(CalculatorsAdminService);

  /** An active admin holding the grants this script needs of them. */
  const principal = async (email: string, needed: string[]): Promise<AdminPrincipal> => {
    const account = await prisma.adminAccount.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!account || account.status !== 'ACTIVE') throw new Error(`No active admin ${email}.`);
    const grants = await accounts.effectiveGrants(account.id);
    const missing = needed.filter((grant) => !grants.includes(grant as never));
    if (missing.length > 0) throw new Error(`${email} lacks ${missing.join(', ')}.`);
    return {
      adminId: account.id,
      sessionId: 'medicalcul-publish',
      email: account.email,
      fullName: account.fullName,
      grants,
    };
  };
  const author = await principal(values.author, ['calculators.draft']);
  const reviewers = await Promise.all(
    values.reviewer
      .split(',')
      .map((email) => principal(email, ['calculators.review', 'calculators.publish'])),
  );
  if (reviewers.some((reviewer) => reviewer.adminId === author.adminId)) {
    throw new Error('A reviewer cannot be the author.');
  }
  const client = { ip: null, userAgent: 'medicalcul-publish' };

  let published = 0;
  const skipped: string[] = [];
  const refused: string[] = [];
  for (const entry of catalogue.calculators) {
    if (!entry.import || !entry.definition || (only && !only.has(entry.id))) continue;
    const { slug } = entry.import;
    const calculator = await prisma.calculator.findUnique({ where: { slug } });
    if (!calculator) {
      skipped.push(`${slug}: not imported`);
      continue;
    }
    const record = await calculators.detail(calculator.id);
    const draft = record.versions.find((version) => version.status === 'DRAFT');
    if (record.versions.some((version) => version.status === 'PUBLISHED') || !draft) {
      skipped.push(`${slug}: already published or no open draft`);
      continue;
    }

    const checked = checkDefinition(completeDefinition(entry.definition));
    if (!checked.ok) {
      refused.push(`${slug}: ${checked.problems.map((problem) => problem.message).join('; ')}`);
      continue;
    }
    const completed = checked.definition;
    // Only a draft that is still the imported one (or this script's own completion of it) is
    // touched: a draft a doctor has worked on is theirs.
    const untouched = [definitionSha256(entry.definition), definitionSha256(completed)];
    if (!untouched.includes(draft.definitionSha256)) {
      skipped.push(`${slug}: the draft was edited by hand`);
      continue;
    }

    let cases;
    try {
      const page = parsePage(readFileSync(path.join(values.raw, entry.sourceFile), 'utf8'));
      cases = referenceCases(page, shared, completed, entry.id);
    } catch (error) {
      if (!(error instanceof NotVerifiable)) throw error;
      refused.push(`${slug}: ${error.message}`);
      continue;
    }
    if (values['dry-run']) {
      published++;
      continue;
    }

    const origin = `${entry.sourceFile} (sha256 ${entry.sourceSha256.slice(0, 12)}…, données ${dataVersion})`;
    await calculators.saveDefinition(author, draft.id, completed, client);
    if (!draft.sources.some((source) => source.role === 'PRIMARY')) {
      const cited = entry.references.join(' ');
      await calculators.addSource(
        author,
        draft.id,
        {
          role: 'PRIMARY',
          authors: 'Mignard P.',
          title: `${entry.title} — Medicalcul`.slice(0, 500),
          publisher: 'Medicalcul, Micromega Software System',
          year: Number(dataVersion.slice(0, 4)),
          url: new URL(entry.sourceFile, site).toString(),
          edition: `Données ${dataVersion}`,
          formulaLocation: (cited
            ? `Fonction de calcul de la page. Références citées par la page : ${cited}`
            : 'Fonction de calcul de la page.'
          ).slice(0, 300),
          accessedAt: today,
        },
        client,
      );
    }
    if (draft.testCases.length === 0) {
      for (const testCase of cases) {
        await calculators.addTestCase(
          author,
          draft.id,
          {
            inputs: testCase.inputs,
            expectedOutcome: 'RESULT',
            expectedValue: testCase.expectedValue,
            tolerance: testCase.tolerance,
            expectedBand: testCase.expectedBand,
            origin: `Valeur calculée par la page Medicalcul ${origin} pour ces réponses.`,
          },
          client,
        );
      }
    }
    await calculators.runTests(author, draft.id, client);
    await calculators.submit(author, draft.id, client);
    const note =
      `Publication en lot des formats Medicalcul (décision du Product Owner, 12 novembre 2026). ` +
      `Résultats identiques à ceux de la page ${origin} sur ${cases.length} jeux de réponses. ` +
      `Restent à compléter par un médecin : limites d’utilisation, plages validées, textes anglais, gravité des seuils.`;
    let version = await calculators.detail(calculator.id).then((detail) => detail.versions[0]!);
    for (const reviewer of reviewers) {
      if (version.status === 'PUBLISHED') break;
      version = await calculators.publish(reviewer, draft.id, note, client);
    }
    if (version.status !== 'PUBLISHED') {
      refused.push(
        `${slug}: in review — the review policy asks for another reviewer (pass two with --reviewer a,b)`,
      );
      continue;
    }
    published++;
  }

  console.log(
    `${values['dry-run'] ? 'Dry run: ' : ''}${published} calculator(s) ${values['dry-run'] ? 'ready to publish' : 'published'}; ` +
      `${skipped.length} skipped; ${refused.length} left as drafts.`,
  );
  for (const line of [...skipped, ...refused]) console.log(`  ${line}`);
} finally {
  await app.close();
}
