// Fills an empty demonstration database with realistic, fictitious data for demos, store
// screenshots and the Admin Web walkthrough — never with clinical content:
//
//   npm run demo:seed -w @doktool/api      (DATABASE_URL must name a database ending in « _demo »)
//
// What it creates: the admin team, the onboarding reference lists, the Pro plans and fee rates,
// ~60 fictitious users (doctors, residents, students) with their verification cases, six months of
// subscriptions, payments and operating expenses, thirty days of analytics, and a reference
// library whose PDFs are labelled « document de démonstration ».
//
// What it never creates: calculator formulas, pregnancy · lactation profiles or prescription
// content. They are authored and reviewed by the medical team in Admin Web (CLAUDE.md, section 28,
// ADR-019); the library PDFs say so on their page.
//
// Every name, e-mail (@demo.doktool.dz) and number is invented. Passwords are random and printed
// once, like `admin:create`.
import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadEnv } from '../config/env.js';
import type {
  AnalyticsEventType,
  EntitlementTier,
  ExpenseCategory,
  PaymentProvider,
  ProfessionalType,
  ReferenceDocumentType,
} from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PasswordHasher } from '../infrastructure/crypto/password-hasher.js';
import { hmacSha256Hex } from '../infrastructure/crypto/tokens.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { AdminAccountsService, type Preset } from '../modules/admin-auth/index.js';
import { StorageKeys, StorageService } from '../modules/storage/index.js';

const DAY = 86_400_000;

// ───────────────────────────── fictitious people ─────────────────────────────

const TEAM: { fullName: string; email: string; preset: Preset }[] = [
  { fullName: 'Dr Amina Belkacem', email: 'amina.belkacem', preset: 'SUPER_ADMIN' },
  { fullName: 'Dr Yacine Haddad', email: 'yacine.haddad', preset: 'CALCULATOR_EDITOR' },
  { fullName: 'Dr Selma Benali', email: 'selma.benali', preset: 'CLINICAL_REVIEWER' },
  { fullName: 'Nadia Cherif', email: 'nadia.cherif', preset: 'VERIFICATION_REVIEWER' },
  { fullName: 'Lina Mansouri', email: 'lina.mansouri', preset: 'LIBRARY_MANAGER' },
  { fullName: 'Karim Ouali', email: 'karim.ouali', preset: 'FINANCE_ADMIN' },
];

const FIRST_NAMES = [
  'Amine',
  'Sara',
  'Mohamed',
  'Imene',
  'Walid',
  'Meriem',
  'Riad',
  'Lynda',
  'Sofiane',
  'Nesrine',
  'Khaled',
  'Asma',
  'Bilal',
  'Yasmine',
  'Hichem',
  'Rania',
  'Anis',
  'Chaima',
  'Mehdi',
  'Feriel',
  'Nassim',
  'Sihem',
  'Omar',
  'Dounia',
  'Farid',
  'Hanane',
  'Ilyes',
  'Kenza',
  'Zakaria',
  'Malika',
];
const LAST_NAMES = [
  'Bouzid',
  'Kaci',
  'Saidi',
  'Benamar',
  'Mebarki',
  'Hamidi',
  'Boudiaf',
  'Larbi',
  'Zerrouki',
  'Mokrani',
  'Belaid',
  'Toumi',
  'Rahmani',
  'Djebbar',
  'Ait Ahmed',
  'Khelifi',
  'Brahimi',
  'Slimani',
  'Bensalem',
  'Ferhat',
  'Guerfi',
  'Hadjadj',
  'Meziane',
  'Ouchene',
  'Remili',
];

const SPECIALTIES = [
  ['MEDECINE_GENERALE', 'Médecine générale', 'General practice'],
  ['PEDIATRIE', 'Pédiatrie', 'Paediatrics'],
  ['CARDIOLOGIE', 'Cardiologie', 'Cardiology'],
  ['GYNECOLOGIE_OBSTETRIQUE', 'Gynécologie-obstétrique', 'Obstetrics and gynaecology'],
  ['MEDECINE_INTERNE', 'Médecine interne', 'Internal medicine'],
  ['PNEUMOLOGIE', 'Pneumologie', 'Pulmonology'],
  ['ENDOCRINOLOGIE', 'Endocrinologie', 'Endocrinology'],
  ['NEUROLOGIE', 'Neurologie', 'Neurology'],
  ['PSYCHIATRIE', 'Psychiatrie', 'Psychiatry'],
  ['DERMATOLOGIE', 'Dermatologie', 'Dermatology'],
  ['ANESTHESIE_REANIMATION', 'Anesthésie-réanimation', 'Anaesthesiology and intensive care'],
  ['MEDECINE_URGENCE', 'Médecine d’urgence', 'Emergency medicine'],
  ['GASTRO_ENTEROLOGIE', 'Gastro-entérologie', 'Gastroenterology'],
  ['NEPHROLOGIE', 'Néphrologie', 'Nephrology'],
] as const;

const UNIVERSITIES = [
  ['Université d’Alger 1 Benyoucef Benkhedda', 16],
  ['Université Oran 1 Ahmed Ben Bella', 31],
  ['Université Constantine 3 Salah Boubnider', 25],
  ['Université Badji Mokhtar Annaba', 23],
  ['Université Ferhat Abbas Sétif 1', 19],
  ['Université Saad Dahlab Blida 1', 9],
  ['Université Mouloud Mammeri Tizi Ouzou', 15],
  ['Université Abou Bekr Belkaïd Tlemcen', 13],
  ['Université Batna 2', 5],
] as const;

const INSTITUTIONS = [
  ['CHU Mustapha Pacha', 16],
  ['CHU Beni Messous', 16],
  ['CHU Nafissa Hamoud (Parnet)', 16],
  ['CHU Oran', 31],
  ['EHU Oran 1er Novembre 1954', 31],
  ['CHU Constantine Benbadis', 25],
  ['CHU Annaba', 23],
  ['CHU Sétif', 19],
  ['CHU Blida Frantz Fanon', 9],
  ['CHU Tizi Ouzou Nedir Mohamed', 15],
  ['CHU Tlemcen', 13],
  ['CHU Batna', 5],
] as const;

// Titles only: the PDF of each says it is a demonstration document without clinical content.
const LIBRARY: { type: ReferenceDocumentType; fr: string; en: string; demoSample?: boolean }[] = [
  {
    type: 'ORDONNANCE',
    fr: 'Angine aiguë de l’adulte',
    en: 'Acute tonsillitis in adults',
    demoSample: true,
  },
  {
    type: 'ORDONNANCE',
    fr: 'Cystite aiguë simple de la femme',
    en: 'Uncomplicated cystitis in women',
  },
  {
    type: 'ORDONNANCE',
    fr: 'Gastro-entérite aiguë de l’enfant',
    en: 'Acute gastroenteritis in children',
    demoSample: true,
  },
  { type: 'ORDONNANCE', fr: 'Crise d’asthme de l’adulte', en: 'Asthma attack in adults' },
  {
    type: 'ORDONNANCE',
    fr: 'Otite moyenne aiguë de l’enfant',
    en: 'Acute otitis media in children',
  },
  { type: 'ORDONNANCE', fr: 'Douleur lombaire aiguë', en: 'Acute low back pain' },
  { type: 'ORDONNANCE', fr: 'Rhinite allergique saisonnière', en: 'Seasonal allergic rhinitis' },
  {
    type: 'ORDONNANCE',
    fr: 'Bilan prénatal du premier trimestre',
    en: 'First-trimester prenatal work-up',
  },
  {
    type: 'ORDONNANCE',
    fr: 'Bilan biologique du diabète de type 2',
    en: 'Type 2 diabetes laboratory work-up',
  },
  { type: 'ORDONNANCE', fr: 'Bronchiolite du nourrisson', en: 'Bronchiolitis in infants' },
  {
    type: 'CERTIFICATE',
    fr: 'Certificat médical d’arrêt de travail',
    en: 'Sick-leave certificate',
    demoSample: true,
  },
  {
    type: 'CERTIFICATE',
    fr: 'Certificat d’aptitude à la pratique sportive',
    en: 'Fitness-for-sport certificate',
  },
  { type: 'CERTIFICATE', fr: 'Certificat de bonne santé', en: 'Certificate of good health' },
  {
    type: 'CERTIFICATE',
    fr: 'Certificat de constatation de coups et blessures',
    en: 'Certificate of injuries',
  },
  { type: 'CERTIFICATE', fr: 'Certificat de vaccination', en: 'Vaccination certificate' },
  { type: 'CERTIFICATE', fr: 'Certificat de non-contagion', en: 'Certificate of non-contagion' },
];

const EXPENSES: { category: ExpenseCategory; label: string; amountMinor: number }[] = [
  {
    category: 'INFRASTRUCTURE',
    label: 'Hébergement API et base de données',
    amountMinor: 1_800_000,
  },
  { category: 'INFRASTRUCTURE', label: 'Stockage des PDF (R2)', amountMinor: 220_000 },
  { category: 'INFRASTRUCTURE', label: 'Envoi des SMS de vérification', amountMinor: 640_000 },
  { category: 'CLINICAL_REVIEW', label: 'Relecture clinique des contenus', amountMinor: 4_500_000 },
  { category: 'SUPPORT', label: 'Assistance aux utilisateurs', amountMinor: 1_500_000 },
];

// ───────────────────────────── helpers ─────────────────────────────

/** Deterministic pseudo-random numbers: the same database each run. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const next = random(20261005);
const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
const between = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
const daysAgo = (days: number, hour = between(8, 21)) => {
  const date = new Date(Date.now() - days * DAY);
  date.setUTCHours(hour - 1, between(0, 59), between(0, 59), 0);
  return date;
};
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** One-page A4 PDF that says what it is: a demonstration document. */
async function demoPdf(title: string, lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer('DokTool');
  const page = pdf.addPage([595.28, 841.89]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.07, 0.2, 0.27);
  page.drawRectangle({ x: 0, y: 781, width: 595.28, height: 61, color: rgb(0.03, 0.36, 0.45) });
  page.drawText('DokTool', { x: 48, y: 803, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Document de démonstration', {
    x: 380,
    y: 806,
    size: 11,
    font: regular,
    color: rgb(1, 1, 1),
  });
  page.drawText(title, { x: 48, y: 730, size: 18, font: bold, color: ink, maxWidth: 500 });
  let y = 690;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 11.5, font: regular, color: ink, maxWidth: 500 });
    y -= 22;
  }
  page.drawRectangle({
    x: 48,
    y: 90,
    width: 499,
    height: 70,
    borderColor: rgb(0.03, 0.36, 0.45),
    borderWidth: 1,
  });
  page.drawText('Base de démonstration : aucune donnée réelle.', {
    x: 62,
    y: 132,
    size: 11,
    font: bold,
    color: ink,
  });
  page.drawText('Le contenu de référence est rédigé et relu par l’équipe médicale de DokTool.', {
    x: 62,
    y: 110,
    size: 10,
    font: regular,
    color: ink,
  });
  return pdf.save();
}

// ───────────────────────────── seed ─────────────────────────────

const env = { ...loadEnv(process.env), JOBS_ENABLED: false };
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
if (env.NODE_ENV === 'production' || !databaseName.endsWith('_demo')) {
  console.error(
    `Refused: the demonstration data goes only into a database whose name ends in « _demo » ` +
      `outside production (this one: « ${databaseName} », ${env.NODE_ENV}).`,
  );
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
  logger: ['error'],
});
try {
  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService);
  if ((await prisma.user.count()) + (await prisma.adminAccount.count()) > 0) {
    console.error('Refused: the database already has accounts. Seed an empty, migrated database.');
    process.exitCode = 2;
  } else {
    await seed(prisma, storage);
  }
} finally {
  await app.close();
}

async function seed(prisma: PrismaService, storage: StorageService): Promise<void> {
  // The team ────────────────────────────────────────────────────────────
  const accounts = app.get(AdminAccountsService);
  const team: Record<Preset, string> = {} as Record<Preset, string>;
  const printed: string[] = [];
  for (const member of TEAM) {
    const password = randomBytes(18).toString('base64url');
    const email = `${member.email}@demo.doktool.dz`;
    const { id } = await accounts.create({
      email,
      fullName: member.fullName,
      password,
      preset: member.preset,
      grantedById: null,
    });
    team[member.preset] = id;
    printed.push(`  ${member.preset.padEnd(22)} ${email}  ${password}`);
  }
  const superAdmin = team.SUPER_ADMIN;

  // Reference lists ─────────────────────────────────────────────────────
  const specialties = await Promise.all(
    SPECIALTIES.map(([code, nameFr, nameEn]) =>
      prisma.specialty.create({ data: { code, nameFr, nameEn } }),
    ),
  );
  const universities = await Promise.all(
    UNIVERSITIES.map(([name, wilayaCode]) =>
      prisma.university.create({ data: { name, wilayaCode } }),
    ),
  );
  const institutions = await Promise.all(
    INSTITUTIONS.map(([name, wilayaCode]) =>
      prisma.institution.create({ data: { name, wilayaCode } }),
    ),
  );

  // Plans and fees (demonstration prices; the Super Admin sets the real ones) ─────
  const plan = (code: string, nameFr: string, nameEn: string, price: number, days: number) =>
    prisma.subscriptionPlan.create({
      data: {
        code,
        version: 1,
        audience: ['DOCTOR', 'RESIDENT'],
        nameFr,
        nameEn,
        priceMinor: price,
        durationDays: days,
        isPurchasable: true,
        includesFr: [
          'Ordonnances et certificats de référence',
          'Tous les calculateurs',
          'Grossesse · Allaitement',
          'Lecture hors ligne',
        ],
        includesEn: [
          'Reference prescriptions and certificates',
          'All calculators',
          'Pregnancy · lactation',
          'Offline reading',
        ],
        excludesFr: ['Renouvellement automatique', 'Génération ou impression de documents'],
        excludesEn: ['Automatic renewal', 'Generating or printing documents'],
      },
    });
  const monthly = await plan('PRO_MONTHLY', 'Pro mensuel', 'Pro monthly', 250_000, 30);
  const annual = await plan('PRO_ANNUAL', 'Pro annuel', 'Pro annual', 2_500_000, 365);
  const fees: Record<PaymentProvider, { rateBps: number; fixedMinor: number }> = {
    CHARGILY_CIB: { rateBps: 150, fixedMinor: 0 },
    CHARGILY_EDAHABIA: { rateBps: 100, fixedMinor: 0 },
    SATIM_CIB: { rateBps: 120, fixedMinor: 0 },
    SATIM_EDAHABIA: { rateBps: 80, fixedMinor: 0 },
  };
  for (const [provider, rate] of Object.entries(fees)) {
    await prisma.paymentFeeRate.create({
      data: { provider: provider as PaymentProvider, ...rate, updatedById: superAdmin },
    });
  }

  // Users ───────────────────────────────────────────────────────────────
  const showcasePassword = randomBytes(12).toString('base64url');
  const hasher = app.get(PasswordHasher);
  const showcaseHash = await hasher.hash(showcasePassword);
  // Nobody knows this one: the other users exist for lists and dashboards only.
  const lockedHash = await hasher.hash(randomBytes(32).toString('base64url'));

  interface Person {
    id: string;
    type: ProfessionalType;
    specialtyCode: string | null;
    wilayaCode: number;
    verified: boolean;
    paying: boolean;
    /** Chance of using the app on a given day: a few daily users, many occasional ones. */
    engagement: number;
    joined: Date;
  }
  /** Audit entries of what the team did, so the history reads like a running service. */
  const history: Prisma.AuditLogEntryCreateManyInput[] = [];
  const people: Person[] = [];
  const used = new Set<string>();
  let transactionNumber = 0;
  const payments: {
    userId: string;
    subscriptionId: string;
    plan: { id: string; priceMinor: number };
    provider: PaymentProvider;
    at: Date;
    status: 'SUCCEEDED' | 'FAILED';
    renewal: boolean;
  }[] = [];

  const showcase: {
    first: string;
    last: string;
    type: ProfessionalType;
    tier: 'PRO' | 'UNPAID' | 'STUDENT';
  }[] = [
    { first: 'Amine', last: 'Bouzid', type: 'DOCTOR', tier: 'PRO' },
    { first: 'Sara', last: 'Kaci', type: 'RESIDENT', tier: 'UNPAID' },
    { first: 'Imene', last: 'Saidi', type: 'STUDENT', tier: 'STUDENT' },
  ];
  const population: { type: ProfessionalType; count: number }[] = [
    { type: 'DOCTOR', count: 26 },
    { type: 'RESIDENT', count: 15 },
    { type: 'STUDENT', count: 19 },
  ];
  const queue = [
    ...showcase.map((entry) => ({ ...entry, showcase: true })),
    ...population.flatMap(({ type, count }) =>
      Array.from({ length: count }, () => {
        let first: string;
        let last: string;
        do {
          first = pick(FIRST_NAMES);
          last = pick(LAST_NAMES);
        } while (used.has(`${first} ${last}`) || showcase.some((s) => s.last === last));
        used.add(`${first} ${last}`);
        return { first, last, type, tier: null, showcase: false };
      }),
    ),
  ];

  const showcaseEmails: string[] = [];
  for (const [index, entry] of queue.entries()) {
    const joined = entry.showcase ? daysAgo(170 - index * 10) : daysAgo(between(1, 178));
    const specialty = entry.type === 'STUDENT' ? null : pick(specialties);
    const institution = entry.type === 'RESIDENT' ? pick(institutions) : null;
    const university = entry.type === 'STUDENT' ? pick(universities) : null;
    const wilayaCode = institution?.wilayaCode ?? university?.wilayaCode ?? pick(INSTITUTIONS)[1];
    const email = `${slug(entry.first)}.${slug(entry.last)}@demo.doktool.dz`;
    if (entry.showcase) showcaseEmails.push(email);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: entry.showcase ? showcaseHash : lockedHash,
        firstName: entry.first,
        lastName: entry.last,
        wilayaCode,
        emailConfirmedAt: joined,
        termsVersion: env.TERMS_VERSION,
        termsAcceptedAt: joined,
        lastSeenAt: daysAgo(entry.showcase ? 0 : between(0, 45)),
        createdAt: joined,
        professionalProfile: {
          create: {
            professionalType: entry.type,
            specialtyId: specialty?.id ?? null,
            institutionId: institution?.id ?? null,
            universityId: university?.id ?? null,
            academicYear: entry.type === 'STUDENT' ? between(3, 7) : null,
            residencyYear: entry.type === 'RESIDENT' ? between(1, 5) : null,
            orderNumberMasked: entry.type === 'DOCTOR' ? `••••${String(between(10, 99))}` : null,
          },
        },
      },
    });

    // Verification: most are verified, some wait in the queue, a few were turned down.
    const roll = next();
    const status = entry.showcase
      ? 'VERIFIED'
      : roll < 0.72
        ? 'VERIFIED'
        : roll < 0.9
          ? 'SUBMITTED'
          : roll < 0.96
            ? 'REJECTED'
            : 'NOT_STARTED';
    const caseType = entry.type === 'STUDENT' ? 'STUDENT_STATUS' : 'PROFESSIONAL_STATUS';
    const details: Prisma.InputJsonObject =
      entry.type === 'DOCTOR'
        ? {
            professionalType: 'DOCTOR',
            orderNumber: `${wilayaCode}/${between(1000, 9999)}`,
            specialtyId: specialty!.id,
          }
        : entry.type === 'RESIDENT'
          ? {
              professionalType: 'RESIDENT',
              residencyYear: between(1, 5),
              institutionId: institution!.id,
              specialtyId: specialty!.id,
            }
          : {
              professionalType: 'STUDENT',
              universityId: university!.id,
              academicYear: between(3, 7),
            };
    const submittedAt =
      status === 'NOT_STARTED'
        ? null
        : status === 'SUBMITTED'
          ? new Date(Date.now() - between(1, 30) * 3_600_000)
          : new Date(joined.getTime() + between(1, 20) * 3_600_000);
    const decided = status === 'VERIFIED' || status === 'REJECTED';
    const verification = await prisma.verificationCase.create({
      data: {
        userId: user.id,
        type: caseType,
        status,
        submittedAt,
        decidedAt: decided ? new Date(submittedAt!.getTime() + between(2, 22) * 3_600_000) : null,
        reviewerId: decided ? team.VERIFICATION_REVIEWER : null,
        rejectionReasonCode: status === 'REJECTED' ? pick(['ILLEGIBLE', 'NAME_MISMATCH']) : null,
        rejectionNote:
          status === 'REJECTED' ? 'Merci d’envoyer une photo nette et complète.' : null,
        expiresAt: status === 'VERIFIED' ? new Date(joined.getTime() + 2 * 365 * DAY) : null,
        declaredDetails: status === 'NOT_STARTED' ? {} : details,
        createdAt: joined,
      },
    });
    if (status === 'SUBMITTED') {
      const stepType =
        entry.type === 'DOCTOR'
          ? 'ORDER_PROOF'
          : entry.type === 'RESIDENT'
            ? 'RESIDENCY_ATTESTATION'
            : 'STUDENT_PROOF';
      const bytes = await demoPdf('Justificatif professionnel', [
        `${entry.first} ${entry.last}`,
        'Pièce fictive créée pour la base de démonstration.',
      ]);
      const documentId = randomUUID();
      const key = StorageKeys.verificationDocument(user.id, verification.id, documentId, 'pdf');
      await storage.upload({
        bucket: 'PRIVATE',
        key,
        body: bytes,
        contentType: 'application/pdf',
      });
      await prisma.verificationDocument.create({
        data: {
          id: documentId,
          caseId: verification.id,
          stepType,
          storageKey: key,
          mimeType: 'application/pdf',
          sizeBytes: bytes.byteLength,
          sha256: sha256(bytes),
        },
      });
    }

    const verified = status === 'VERIFIED';
    people.push({
      id: user.id,
      type: entry.type,
      specialtyCode: specialty?.code ?? null,
      wilayaCode,
      verified,
      paying: false,
      engagement: entry.showcase ? 0.8 : pick([0, 0.04, 0.1, 0.2, 0.35, 0.6]),
      joined,
    });
    if (decided) {
      history.push({
        actorType: 'ADMIN',
        actorId: team.VERIFICATION_REVIEWER,
        action: status === 'VERIFIED' ? 'verification.approved' : 'verification.rejected',
        entityType: 'VerificationCase',
        entityId: verification.id,
        after: { status, type: caseType },
        occurredAt: verification.decidedAt!,
      });
    }

    // Subscriptions and payments: about half the verified professionals pay.
    const pays =
      entry.type !== 'STUDENT' &&
      verified &&
      (entry.tier === 'PRO' || (entry.tier === null && next() < 0.55));
    if (!pays) continue;
    people[people.length - 1]!.paying = true;
    const chosen = entry.tier === 'PRO' || next() < 0.35 ? annual : monthly;
    const provider: PaymentProvider = next() < 0.6 ? 'CHARGILY_EDAHABIA' : 'CHARGILY_CIB';
    let start = new Date(Math.max(joined.getTime() + 2 * DAY, Date.now() - between(5, 170) * DAY));
    if (entry.tier === 'PRO') start = daysAgo(40);
    // One failed attempt now and then, as with real cards; the next attempt pays.
    const failedFirst = next() < 0.15;
    // Manual renewal extends the same subscription: most monthly subscribers renew, some lapse.
    const periods: Date[] = [start];
    for (;;) {
      const last = periods[periods.length - 1]!;
      const end = new Date(last.getTime() + chosen.durationDays * DAY);
      if (end.getTime() > Date.now() || periods.length === 6 || next() < 0.2) break;
      const renewal = new Date(end.getTime() + between(0, 3) * DAY);
      if (renewal.getTime() > Date.now()) break;
      periods.push(renewal);
    }
    const currentStart = periods[periods.length - 1]!;
    const currentEnd = new Date(currentStart.getTime() + chosen.durationDays * DAY);
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: chosen.id,
        status: currentEnd.getTime() > Date.now() ? 'ACTIVE' : 'EXPIRED',
        currentPeriodStart: currentStart,
        currentPeriodEnd: currentEnd,
        createdAt: start,
      },
    });
    for (const [index, at] of periods.entries()) {
      if (index === 0 && failedFirst) {
        payments.push({
          userId: user.id,
          subscriptionId: subscription.id,
          plan: chosen,
          provider,
          at: new Date(at.getTime() - 20 * 60_000),
          status: 'FAILED',
          renewal: false,
        });
      }
      payments.push({
        userId: user.id,
        subscriptionId: subscription.id,
        plan: chosen,
        provider,
        at,
        status: 'SUCCEEDED',
        renewal: index > 0,
      });
    }
  }

  // Payments are numbered in the order they happened, as the checkout numbers them.
  payments.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const payment of payments) {
    transactionNumber += 1;
    const rate = fees[payment.provider];
    const fee = Math.round((payment.plan.priceMinor * rate.rateBps) / 10_000) + rate.fixedMinor;
    const succeeded = payment.status === 'SUCCEEDED';
    await prisma.transaction.create({
      data: {
        transactionId: `DT-${payment.at.getUTCFullYear()}-${String(transactionNumber).padStart(6, '0')}`,
        userId: payment.userId,
        subscriptionId: payment.subscriptionId,
        planId: payment.plan.id,
        amountMinor: payment.plan.priceMinor,
        currency: 'DZD',
        paymentProvider: payment.provider,
        providerReference: `demo_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
        status: payment.status,
        paymentDate: succeeded ? payment.at : null,
        paymentFeesMinor: succeeded ? fee : null,
        netAmountMinor: succeeded ? payment.plan.priceMinor - fee : null,
        metadata: { renewal: payment.renewal, language: 'FR', demo: true },
        createdAt: payment.at,
      },
    });
  }

  // Operating expenses, six months ──────────────────────────────────────
  for (let month = 5; month >= 0; month -= 1) {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - month, 5);
    for (const expense of EXPENSES) {
      await prisma.operatingExpense.create({
        data: {
          category: expense.category,
          label: expense.label,
          amountMinor: Math.round(expense.amountMinor * (0.9 + next() * 0.2)),
          incurredOn: new Date(date.toISOString().slice(0, 10)),
          createdById: team.FINANCE_ADMIN,
        },
      });
    }
  }

  // Reference library ───────────────────────────────────────────────────
  const libraryIds: { id: string; type: ReferenceDocumentType }[] = [];
  for (const item of LIBRARY) {
    const lines =
      item.type === 'CERTIFICATE'
        ? [
            'Je soussigné(e), Docteur ........................................................',
            'certifie avoir examiné ce jour M. / Mme ......................................',
            '................................................................................................',
            'Fait à ........................................, le ........................................',
            'Signature et cachet du médecin',
          ]
        : [
            'Modèle d’ordonnance de référence.',
            'Ce document de démonstration ne contient aucune prescription.',
          ];
    const bytes = await demoPdf(item.fr, lines);
    const hash = sha256(bytes);
    const documentId = randomUUID();
    const fileId = randomUUID();
    const key = StorageKeys.referenceDocument(item.type, documentId, 1, hash);
    await storage.upload({ bucket: 'CONTENT', key, body: bytes, contentType: 'application/pdf' });
    const created = daysAgo(between(20, 160));
    await prisma.$transaction(async (tx) => {
      await tx.referenceDocument.create({
        data: {
          id: documentId,
          type: item.type,
          titleFr: item.fr,
          titleEn: item.en,
          demoSample: item.demoSample ?? false,
          status: 'PROCESSING',
          statusAfterProcessing: 'ENABLED',
          createdById: team.LIBRARY_MANAGER,
          updatedById: team.LIBRARY_MANAGER,
          createdAt: created,
        },
      });
      await tx.referenceDocumentFile.create({
        data: {
          id: fileId,
          documentId,
          version: 1,
          storageKey: key,
          declaredSha256: hash,
          sha256: hash,
          sizeBytes: bytes.byteLength,
          pageCount: 1,
          processingStatus: 'READY',
          processedAt: created,
          uploadedById: team.LIBRARY_MANAGER,
          uploadedAt: created,
        },
      });
      await tx.referenceDocument.update({
        where: { id: documentId },
        data: {
          currentFileId: fileId,
          status: 'ENABLED',
          statusAfterProcessing: null,
          updatedAt: created,
        },
      });
    });
    libraryIds.push({ id: documentId, type: item.type });
    history.push({
      actorType: 'ADMIN',
      actorId: team.LIBRARY_MANAGER,
      action: 'reference.created',
      entityType: 'ReferenceDocument',
      entityId: documentId,
      after: {
        type: item.type,
        titleFr: item.fr,
        demoSample: item.demoSample ?? false,
        fileVersion: 1,
      },
      reason: 'Ajout au catalogue',
      occurredAt: created,
    });
  }

  // Favorites and history of the showcase doctor ────────────────────────
  const doctor = people[0]!;
  for (const [index, item] of libraryIds.slice(0, 4).entries()) {
    await prisma.favorite.create({
      data: {
        userId: doctor.id,
        targetType: 'REFERENCE_DOCUMENT',
        targetId: item.id,
        createdAt: daysAgo(30 - index * 5),
      },
    });
  }
  for (const [index, item] of libraryIds.slice(2, 9).entries()) {
    await prisma.recentActivity.create({
      data: {
        userId: doctor.id,
        kind: 'REFERENCE_VIEW',
        targetType: 'REFERENCE_DOCUMENT',
        targetId: item.id,
        occurredAt: daysAgo(index, 9 + index),
        deviceId: 'demo-device',
      },
    });
  }

  // Thirty days of analytics ────────────────────────────────────────────
  const events: Prisma.AnalyticsEventCreateManyInput[] = [];
  const subject = (kind: 'user' | 'demo', id: string) =>
    hmacSha256Hex(env.ANALYTICS_SUBJECT_SECRET, `${kind}:${id}`);
  const tierOf = (person: Person): EntitlementTier =>
    person.type === 'STUDENT' ? 'STUDENT' : person.paying ? 'PROFESSIONAL' : 'PROFESSIONAL_UNPAID';
  for (let day = 29; day >= 0; day -= 1) {
    const active = people.filter(
      (person) => person.joined.getTime() < Date.now() - day * DAY && next() < person.engagement,
    );
    for (const person of active) {
      const base = {
        subjectHash: subject('user', person.id),
        accessContext: 'AUTHENTICATED' as const,
        professionalType: person.type,
        entitlementTier: tierOf(person),
        specialtyCode: person.specialtyCode,
        wilayaCode: person.wilayaCode,
        platform: next() < 0.78 ? ('ANDROID' as const) : ('IOS' as const),
        appVersion: '1.0.0',
      };
      for (let action = between(1, 6); action > 0; action -= 1) {
        const occurredAt = daysAgo(day);
        if (occurredAt.getTime() > Date.now()) continue;
        const document = pick(libraryIds);
        const kind = next();
        const event = (
          type: AnalyticsEventType,
          properties: Prisma.InputJsonObject,
          entityId: string | null = null,
        ) =>
          events.push({
            ...base,
            type,
            occurredAt,
            entityType: entityId ? 'REFERENCE_DOCUMENT' : null,
            entityId,
            properties,
          });
        if (kind < 0.35) {
          event('SEARCH_PERFORMED', {
            resultCount: between(0, 12),
            groups: ['REFERENCE_DOCUMENT'],
          });
        } else if (kind < 0.75) {
          event('REFERENCE_OPENED', { referenceType: document.type }, document.id);
          event(
            'REFERENCE_VIEWED',
            { fileVersion: 1, source: next() < 0.2 ? 'offline' : 'online' },
            document.id,
          );
        } else if (kind < 0.85) {
          event('FAVORITE_ADDED', { targetType: 'REFERENCE_DOCUMENT' }, document.id);
        } else {
          event('SUBSCRIPTION_VIEWED', { screen: pick(['plans', 'subscription'] as const) });
        }
      }
    }
    // Visitors of the demo, without an account.
    for (let visit = between(3, 9); visit > 0; visit -= 1) {
      const demo = subject('demo', randomUUID());
      const occurredAt = daysAgo(day);
      if (occurredAt.getTime() > Date.now()) continue;
      const common = {
        subjectHash: demo,
        accessContext: 'DEMO' as const,
        entitlementTier: 'DEMO' as const,
        platform: next() < 0.75 ? ('ANDROID' as const) : ('IOS' as const),
        appVersion: '1.0.0',
        occurredAt,
      };
      events.push({
        ...common,
        type: 'DEMO_STARTED',
        properties: { demoContext: next() < 0.7 ? 'DOCTOR' : 'RESIDENT' },
      });
      events.push({
        ...common,
        type: 'DEMO_FEATURE_VIEWED',
        properties: {
          module: pick(['library', 'calculator', 'search', 'subscription'] as const),
          locked: next() < 0.4,
        },
      });
    }
  }
  for (let start = 0; start < events.length; start += 1_000) {
    await prisma.analyticsEvent.createMany({ data: events.slice(start, start + 1_000) });
  }

  history.sort((a, b) => (a.occurredAt as Date).getTime() - (b.occurredAt as Date).getTime());
  await prisma.auditLogEntry.createMany({ data: history });
  await prisma.auditLogEntry.create({
    data: {
      actorType: 'SYSTEM',
      action: 'demo.seeded',
      entityType: 'Database',
      entityId: databaseName,
      after: {
        admins: TEAM.length,
        users: people.length,
        transactions: transactionNumber,
        documents: libraryIds.length,
        analyticsEvents: events.length,
      },
    },
  });

  console.log(`Demonstration data written to « ${databaseName} »:`);
  console.log(
    `  ${people.length} users, ${transactionNumber} payments, ${libraryIds.length} library PDFs, ` +
      `${events.length} analytics events.`,
  );
  console.log('Admin Web (TOTP enrolment at first sign-in) — passwords shown once:');
  for (const line of printed) console.log(line);
  console.log(`Mobile showcase accounts (password ${showcasePassword}):`);
  console.log(`  Pro doctor          ${showcaseEmails[0]}`);
  console.log(`  Unpaid resident     ${showcaseEmails[1]}`);
  console.log(`  Student             ${showcaseEmails[2]}`);
  console.log(
    'Clinical content (calculators, pregnancy profiles, real models) is not seeded: author it in Admin Web.',
  );
}
