// The normalised Medicalcul catalogue: one entry per calculator page with provenance, the
// classification of its logic, and — when the logic translates exactly — a DokTool definition.
// It keeps data (titles, field labels, point values, thresholds, citations), never the page's
// prose or code: those stay in the raw archive outside git.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { calculatorDefinition, SLUG_PATTERN } from '../../modules/calculators/index.js';
import { NoCalculation, translate, Unsupported } from './logic.js';
import { parsePage } from './page.js';

export const CLASSIFICATIONS = [
  /** f_Calculer translated exactly into a DokTool definition (draft, review required). */
  'STRUCTURED_CALCULATION_DEFINITION',
  /** f_Calculer exists but uses constructs without an exact engine equivalent. */
  'FORMULA_TEXT_AVAILABLE',
  /** A page without calculation logic. */
  'METADATA_ONLY',
  /** The page itself could not be read. */
  'UNRESOLVED',
] as const;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const sourceSchema = z
  .object({
    app: z.string(),
    apk: z.object({ url: z.string(), sha256, bytes: z.number().int() }).strict(),
    servers: z.array(z.string()).min(1),
    descriptor: z
      .object({
        path: z.string(),
        header: z.string(),
        dataVersion: z.string(),
        archive: z.string(),
        startPage: z.string(),
      })
      .strict(),
    archive: z
      .object({
        sha256,
        bytes: z.number().int(),
        identicalOn: z.array(z.string()),
        unavailableOn: z.array(z.string()),
      })
      .strict(),
    retrievedAt: z.string(),
  })
  .strict();
export type CatalogueSource = z.infer<typeof sourceSchema>;

export const entrySchema = z
  .object({
    id: z.string(),
    sourceFile: z.string(),
    sourceSha256: sha256,
    /** Listed in the app's alphabetical index (_indexalpha.html). */
    indexed: z.boolean(),
    title: z.string(),
    specialty: z.string().nullable(),
    specialtyLabel: z.string().nullable(),
    fields: z
      .object({
        radioGroups: z.number().int(),
        checkboxes: z.number().int(),
        numbers: z.number().int(),
        lists: z.number().int(),
        results: z.number().int(),
      })
      .strict(),
    references: z.array(z.string()),
    hasInterpretationText: z.boolean(),
    logic: z
      .object({
        classification: z.enum(CLASSIFICATIONS),
        executableLogic: z.boolean(),
        scriptSha256: sha256.nullable(),
        helpers: z.array(z.string()),
        reasons: z.array(z.string()),
      })
      .strict(),
    import: z
      .object({
        slug: z.string().regex(SLUG_PATTERN),
        nameFr: z.string(),
        category: z.string().nullable(),
      })
      .strict()
      .nullable(),
    definition: calculatorDefinition.nullable(),
    reviewNotes: z.array(z.string()),
    readiness: z
      .object({
        technical: z.enum(['DATA_PARSED', 'DATA_NORMALIZED']),
        clinical: z.literal('CLINICAL_REVIEW_REQUIRED'),
        reusePermission: z.literal('NOT_CONFIRMED'),
      })
      .strict(),
  })
  .strict();
export type CatalogueEntry = z.infer<typeof entrySchema>;

export const catalogueSchema = z
  .object({
    schemaVersion: z.literal(1),
    generator: z.string(),
    source: sourceSchema,
    counts: z.record(z.string(), z.number().int()),
    calculators: z.array(entrySchema),
  })
  .strict();
export type Catalogue = z.infer<typeof catalogueSchema>;

/** SHA-256 in hex. */
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** DokTool slug from the page file name: abcd2.html → abcd2, aclf_grades.html → aclf-grades. */
export const slugFor = (id: string) =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/**
 * Turns one downloaded Medicalcul page into a catalogue entry: title, specialty, provenance and,
 * when the translator succeeds, a DokTool draft definition.
 */
export function buildEntry(file: string, bytes: Buffer, indexed: boolean): CatalogueEntry {
  const id = file.replace(/\.html$/, '');
  const base = {
    id,
    sourceFile: file,
    sourceSha256: hash(bytes),
    indexed,
    readiness: {
      technical: 'DATA_PARSED' as const,
      clinical: 'CLINICAL_REVIEW_REQUIRED' as const,
      reusePermission: 'NOT_CONFIRMED' as const,
    },
  };
  let page;
  try {
    page = parsePage(bytes.toString('utf8'));
  } catch (error) {
    return {
      ...base,
      title: id,
      specialty: null,
      specialtyLabel: null,
      fields: { radioGroups: 0, checkboxes: 0, numbers: 0, lists: 0, results: 0 },
      references: [],
      hasInterpretationText: false,
      logic: {
        classification: 'UNRESOLVED',
        executableLogic: false,
        scriptSha256: null,
        helpers: [],
        reasons: [`page does not parse: ${(error as Error).message}`],
      },
      import: null,
      definition: null,
      reviewNotes: [],
    };
  }

  const names = (kind: string) =>
    new Set(page.controls.filter((c) => c.kind === kind).map((c) => c.name)).size;
  const script = page.scripts.join('\n');
  const executableLogic = /function\s+f_Calculer\s*\(/.test(script);
  const helpers = [...new Set(script.match(/\bf_[A-Za-z]+(?=\s*\()/g) ?? [])]
    .filter((name) => name !== 'f_Calculer')
    .sort();

  let classification: CatalogueEntry['logic']['classification'] = executableLogic
    ? 'FORMULA_TEXT_AVAILABLE'
    : 'METADATA_ONLY';
  const reasons: string[] = [];
  let definition: CatalogueEntry['definition'] = null;
  let reviewNotes: string[] = [];
  if (executableLogic) {
    try {
      const translation = translate(page);
      definition = translation.definition;
      reviewNotes = translation.reviewNotes;
      classification = 'STRUCTURED_CALCULATION_DEFINITION';
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      if (error instanceof NoCalculation) classification = 'METADATA_ONLY';
      reasons.push(error.message);
    }
  } else {
    reasons.push('no f_Calculer function on the page');
  }

  const slug = slugFor(id);
  return {
    ...base,
    title: page.title,
    specialty: page.specialty,
    specialtyLabel: page.specialtyLabel,
    fields: {
      radioGroups: names('radio'),
      checkboxes: names('checkbox'),
      numbers: names('number'),
      lists: names('select'),
      results: names('output'),
    },
    references: page.references,
    hasInterpretationText: page.hasInterpretation,
    logic: {
      classification,
      executableLogic,
      scriptSha256: executableLogic ? hash(script) : null,
      helpers,
      reasons,
    },
    import: definition
      ? { slug, nameFr: page.title.slice(0, 120), category: page.specialtyLabel }
      : null,
    definition,
    reviewNotes,
    readiness: { ...base.readiness, technical: definition ? 'DATA_NORMALIZED' : 'DATA_PARSED' },
  };
}

/** Builds the whole catalogue from every page, in a stable order. */
export function buildCatalogue(
  source: CatalogueSource,
  pages: { file: string; bytes: Buffer }[],
  indexedFiles: ReadonlySet<string>,
): Catalogue {
  const calculators = [...pages]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((page) => buildEntry(page.file, page.bytes, indexedFiles.has(page.file)));
  const slugs = new Map<string, string>();
  for (const entry of calculators) {
    if (!entry.import) continue;
    const other = slugs.get(entry.import.slug);
    if (other) {
      entry.logic.reasons.push(`slug « ${entry.import.slug} » also used by ${other}`);
      entry.import = null;
      continue;
    }
    slugs.set(entry.import.slug, entry.id);
  }
  const counts: Record<string, number> = { pages: calculators.length };
  for (const classification of CLASSIFICATIONS)
    counts[classification] = calculators.filter(
      (c) => c.logic.classification === classification,
    ).length;
  counts.indexed = calculators.filter((c) => c.indexed).length;
  counts.importable = calculators.filter((c) => c.import !== null).length;
  return catalogueSchema.parse({
    schemaVersion: 1,
    generator: 'apps/api/src/scripts/extract-medicalcul.ts',
    source,
    counts,
    calculators,
  });
}

/** One cell of coverage.csv. */
const csvCell = (value: string | number | boolean | null | undefined | string[]) => {
  const text = Array.isArray(value)
    ? value.join(' | ')
    : value === null || value === undefined
      ? ''
      : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One row per page: the coverage matrix of the integration report. */
export function coverageCsv(catalogue: Catalogue): string {
  const header = [
    'id',
    'title',
    'specialty',
    'indexed',
    'source_file',
    'source_sha256',
    'radio_groups',
    'checkboxes',
    'numbers',
    'lists',
    'results',
    'references',
    'executable_logic',
    'classification',
    'helpers',
    'reasons',
    'importable_as',
    'technical_readiness',
    'clinical_readiness',
    'reuse_permission',
    'review_notes',
  ];
  const rows = catalogue.calculators.map((c) => [
    c.id,
    c.title,
    c.specialtyLabel ?? c.specialty,
    c.indexed,
    c.sourceFile,
    c.sourceSha256,
    c.fields.radioGroups,
    c.fields.checkboxes,
    c.fields.numbers,
    c.fields.lists,
    c.fields.results,
    c.references.length,
    c.logic.executableLogic,
    c.logic.classification,
    c.logic.helpers,
    c.logic.reasons,
    c.import?.slug ?? '',
    c.readiness.technical,
    c.readiness.clinical,
    c.readiness.reusePermission,
    c.reviewNotes,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

/** JSON Schema of catalogue.json, written next to it. */
export const catalogueJsonSchema = () =>
  z.toJSONSchema(catalogueSchema, { target: 'draft-2020-12' });
