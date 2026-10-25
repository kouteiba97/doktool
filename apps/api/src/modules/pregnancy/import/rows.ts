// Pure rules of the spreadsheet import (ADR-025): which column is which, what a cell means, and
// what is wrong with a row. No database access here: the service passes a snapshot of the library.
// Nothing is guessed: an unknown period, an unmapped status word or an ambiguous drug name is an
// error the admin resolves; similar names are never matched.
import { normaliseForSearch } from '../../../common/text/search-text.js';
import { CONDUCTS, type Conduct, type ProfileContent } from '../pregnancy.content.js';
import type { Cell } from './workbook.js';

export const PARSER_VERSION = 'pregnancy-import/1';

export const FIELDS = [
  'substance',
  'context',
  'period',
  'status',
  'alternative',
  'sourceUrl',
  'sourceTitle',
] as const;
export type Field = (typeof FIELDS)[number];
export type ColumnMapping = Record<string, Field | 'ignore'>;

/** Conduct chosen by the admin for a status word; NONE = no badge. */
export const STATUS_TARGETS = [...CONDUCTS, 'NONE'] as const;
export type StatusTarget = (typeof STATUS_TARGETS)[number];
export type StatusMapping = Record<string, StatusTarget>;

export const TARGETS = ['T1', 'T2', 'T3', 'PERIPARTUM', 'LACTATION'] as const;
export type Target = (typeof TARGETS)[number];

/** Editable values of a row, as text (what the admin sees and corrects). */
export type RowValues = Record<Field, string | null>;

export type Severity = 'ERROR' | 'WARNING' | 'INFO';
/** One problem or note about a row, shown in the preview. */
export interface Issue {
  field: Field | 'row';
  severity: Severity;
  code: string;
  /** Data for the message: a row number, a name… never free clinical text. */
  params?: Record<string, string | number>;
}

// ─────────────────────────────── columns ───────────────────────────────

const HEADER_WORDS: Record<Field, string[]> = {
  substance: [
    'medicament',
    'molecule',
    'dci',
    'principe actif',
    'substance',
    'drug',
    'nom',
    'specialite',
  ],
  context: [
    'contexte',
    'context',
    'situation',
    'grossesse/allaitement',
    'grossesse ou allaitement',
  ],
  period: ['periode', 'period', 'trimestre', 'terme', 'moment'],
  status: ['statut', 'status', 'validation', 'valide', 'avis', 'conduite', 'recommandation'],
  alternative: ['alternative', 'generique', 'substitut', 'remplacement', 'equivalent'],
  sourceUrl: ['lien', 'link', 'url', 'source', 'reference', 'hyperlien'],
  sourceTitle: ['titre de la source', 'nom de la source', 'source title', 'titre source'],
};

/** Field a header names, or null. Longer keywords win (« titre de la source » before « source »). */
export function fieldForHeader(header: string | null): Field | null {
  const text = normaliseForSearch(header ?? '');
  if (!text) return null;
  let best: { field: Field; length: number } | null = null;
  for (const field of FIELDS) {
    for (const word of HEADER_WORDS[field]) {
      if ((text === word || text.includes(word)) && (!best || word.length > best.length))
        best = { field, length: word.length };
    }
  }
  return best?.field ?? null;
}

/** Header row: the first of the first ten rows with at least two filled cells. */
export function findHeaderRow(rows: Cell[][]): number {
  for (let index = 0; index < Math.min(rows.length, 10); index++) {
    if (rows[index]!.filter((cell) => cell.text).length >= 2) return index;
  }
  return -1;
}

/** Guesses which column holds which field from the header names. */
export function detectColumns(headers: (string | null)[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<Field>();
  headers.forEach((header, index) => {
    const field = fieldForHeader(header);
    mapping[String(index)] = field && !taken.has(field) ? field : 'ignore';
    if (field) taken.add(field);
  });
  return mapping;
}

/** The required fields (substance, period, status) no column is mapped to. */
export function missingColumns(mapping: ColumnMapping): Field[] {
  const mapped = new Set(Object.values(mapping));
  return (['substance', 'period', 'status'] as const).filter((field) => !mapped.has(field));
}

/** Editable values of a data row under a column mapping. */
export function valuesOf(cells: Cell[], mapping: ColumnMapping): RowValues {
  const values = Object.fromEntries(FIELDS.map((field) => [field, null])) as RowValues;
  for (const [index, field] of Object.entries(mapping)) {
    if (field === 'ignore') continue;
    const cell = cells[Number(index)];
    if (!cell) continue;
    if (field === 'sourceUrl') {
      // The link is the hyperlink target when there is one; the shown text is then its title.
      if (cell.hyperlink) {
        values.sourceUrl = cell.hyperlink;
        if (cell.text && cell.text !== cell.hyperlink && !values.sourceTitle)
          values.sourceTitle = cell.text;
      } else {
        values.sourceUrl = cell.text;
      }
    } else {
      values[field] = cell.text;
    }
  }
  return values;
}

// ─────────────────────────────── cell meaning ───────────────────────────────

const PERIOD_WORDS: Record<Target, RegExp> = {
  T1: /^(t1|1(er|e|ere|eme)? trimestre|premier trimestre|trimestre 1|1st trimester|first trimester)$/,
  T2: /^(t2|2(e|eme|nd)? trimestre|deuxieme trimestre|second trimestre|trimestre 2|2nd trimester|second trimester)$/,
  T3: /^(t3|3(e|eme|rd)? trimestre|troisieme trimestre|trimestre 3|3rd trimester|third trimester)$/,
  PERIPARTUM: /^(peri-?partum|peri partum|per-?partum|accouchement|delivery)$/,
  LACTATION: /^(allaitement|allaitement maternel|lactation|breastfeeding|breast-feeding)$/,
};
const WHOLE_PREGNANCY =
  /^(toute la grossesse|toute grossesse|grossesse entiere|pendant toute la grossesse|whole pregnancy|entire pregnancy)$/;

export type PeriodResult = { targets: Target[] } | { error: 'PERIOD_MISSING' | 'PERIOD_UNKNOWN' };

/** « T1 », « 1er trimestre », « T1, T2 », « Toute la grossesse » (= the four periods), « Allaitement ». */
export function parsePeriod(raw: string | null): PeriodResult {
  const text = normaliseForSearch(raw ?? '');
  if (!text) return { error: 'PERIOD_MISSING' };
  if (WHOLE_PREGNANCY.test(text)) return { targets: ['T1', 'T2', 'T3', 'PERIPARTUM'] };
  const parts = text.split(/\s*(?:,|;|\+|\/|\bet\b|\band\b)\s*/).filter(Boolean);
  const targets: Target[] = [];
  for (const part of parts) {
    const target = TARGETS.find((candidate) => PERIOD_WORDS[candidate].test(part));
    if (!target) return { error: 'PERIOD_UNKNOWN' };
    if (!targets.includes(target)) targets.push(target);
  }
  return targets.length > 0 ? { targets } : { error: 'PERIOD_UNKNOWN' };
}

export type ContextValue = 'PREGNANCY' | 'LACTATION';
/** Reads a "pregnancy / lactation" column (null when empty, UNKNOWN when unreadable). */
export function parseContext(raw: string | null): ContextValue | null | 'UNKNOWN' {
  const text = normaliseForSearch(raw ?? '');
  if (!text) return null;
  if (/^(grossesse|pregnancy|enceinte)$/.test(text)) return 'PREGNANCY';
  if (/^(allaitement|allaitement maternel|lactation|breastfeeding)$/.test(text)) return 'LACTATION';
  return 'UNKNOWN';
}

/** The form a status word is mapped under: « Non valide », « non  valide » → « non valide ». */
export const statusKey = (raw: string | null) => normaliseForSearch(raw ?? '');

/** Reads a source URL: only http(s) with a host; anything else is an error for the row. */
export function parseUrl(
  raw: string | null,
): { url: string; host: string } | { error: string } | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: 'URL_INVALID' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'URL_SCHEME' };
  if (url.username || url.password) return { error: 'URL_CREDENTIALS' };
  if (!url.hostname.includes('.')) return { error: 'URL_INVALID' };
  return { url: url.toString(), host: url.hostname };
}

/** Several alternatives in one cell: « paracétamol ; ibuprofène ». Commas stay inside names. */
export const splitAlternatives = (raw: string | null) =>
  (raw ?? '')
    .split(/\s*[;|\n]\s*/)
    .map((name) => name.trim())
    .filter(Boolean);

// ─────────────────────────────── validation ───────────────────────────────

/** A substance as the import sees it: its names and its open and published content. */
export interface LibrarySubstance {
  id: string;
  nameFr: string;
  names: string[];
  /** The open (DRAFT / CHANGES_REQUESTED / IN_REVIEW) version, if any. */
  open: { id: string; status: string; authoredById: string; content: ProfileContent } | null;
  published: ProfileContent | null;
}

/** Substances indexed by every normalised name and synonym. */
export interface Library {
  /** Normalised name or synonym → substances bearing it. */
  byName: Map<string, LibrarySubstance[]>;
}

/** Builds the name index of the existing substances. */
export function libraryOf(substances: LibrarySubstance[]): Library {
  const byName = new Map<string, LibrarySubstance[]>();
  for (const substance of substances) {
    for (const name of new Set(substance.names.map(normaliseForSearch).filter(Boolean))) {
      const list = byName.get(name) ?? [];
      list.push(substance);
      byName.set(name, list);
    }
  }
  return { byName };
}

/** One stored row of the batch: its values, original cells, and the admin's choices. */
export interface RowInput {
  id: string;
  rowNumber: number;
  values: RowValues;
  original: Cell[];
  excluded: boolean;
  resolution: 'UPDATE' | 'SKIP' | null;
}

/** The source a row cites. */
export interface PlanSource {
  url: string;
  host: string;
  title: string | null;
}

/** The result of checking a row: its issues and, without errors, what it would write. */
export interface CheckedRow {
  id: string;
  issues: Issue[];
  /** What the row would write, when it has no error. */
  plan: {
    substanceKey: string;
    substanceName: string;
    existing: LibrarySubstance | null;
    targets: Target[];
    conduct: Conduct | null;
    reportedStatus: string;
    alternatives: { name: string; substance: LibrarySubstance | null; key: string }[];
    source: PlanSource | null;
    skip: boolean;
  } | null;
}

/** True when one of the issues is an error. */
const blocking = (issues: Issue[]) => issues.some((issue) => issue.severity === 'ERROR');

/** The period (or lactation block) already in a profile, if any. */
function existingPeriod(content: ProfileContent | null, target: Target) {
  if (!content) return null;
  if (target === 'LACTATION') return content.lactation;
  return content.pregnancy?.periods[target] ?? null;
}

/**
 * Checks every row against the others and the library, for the admin who will commit (`authorId`).
 * Rows marked excluded are reported but take no part in duplicates.
 */
export function checkRows(
  rows: RowInput[],
  statusMapping: StatusMapping,
  library: Library,
  authorId: string,
): CheckedRow[] {
  const inFile = new Map<string, string>();
  for (const row of rows) {
    if (row.excluded) continue;
    const key = normaliseForSearch(row.values.substance ?? '');
    if (key && !inFile.has(key)) inFile.set(key, row.values.substance!.trim());
  }

  const checked = rows.map((row): CheckedRow => {
    const issues: Issue[] = [];
    const v = row.values;
    if (row.original.some((cell) => cell.formula))
      issues.push({ field: 'row', severity: 'WARNING', code: 'FORMULA_VALUE' });

    const substanceName = (v.substance ?? '').trim();
    const substanceKey = normaliseForSearch(substanceName);
    let existing: LibrarySubstance | null = null;
    if (!substanceKey)
      issues.push({ field: 'substance', severity: 'ERROR', code: 'SUBSTANCE_MISSING' });
    else {
      const matches = library.byName.get(substanceKey) ?? [];
      if (matches.length > 1)
        issues.push({
          field: 'substance',
          severity: 'ERROR',
          code: 'SUBSTANCE_AMBIGUOUS',
          params: { names: matches.map((m) => m.nameFr).join(' · ') },
        });
      else if (matches.length === 1) {
        existing = matches[0]!;
        issues.push({
          field: 'substance',
          severity: 'INFO',
          code: 'SUBSTANCE_EXISTING',
          params: { name: existing.nameFr },
        });
      } else issues.push({ field: 'substance', severity: 'INFO', code: 'SUBSTANCE_NEW' });
    }

    const period = parsePeriod(v.period);
    const context = parseContext(v.context);
    let targets: Target[] = [];
    if ('error' in period) issues.push({ field: 'period', severity: 'ERROR', code: period.error });
    else targets = period.targets;
    if (context === 'UNKNOWN')
      issues.push({ field: 'context', severity: 'ERROR', code: 'CONTEXT_UNKNOWN' });
    else if (context && targets.length > 0) {
      const lactation = targets.includes('LACTATION');
      const pregnancy = targets.some((target) => target !== 'LACTATION');
      if ((context === 'LACTATION' && pregnancy) || (context === 'PREGNANCY' && lactation))
        issues.push({ field: 'period', severity: 'ERROR', code: 'CONTEXT_PERIOD_MISMATCH' });
    }

    const reportedStatus = (v.status ?? '').trim();
    let conduct: Conduct | null = null;
    if (!reportedStatus)
      issues.push({ field: 'status', severity: 'ERROR', code: 'STATUS_MISSING' });
    else {
      const mapped = statusMapping[statusKey(reportedStatus)];
      if (!mapped) issues.push({ field: 'status', severity: 'ERROR', code: 'STATUS_UNMAPPED' });
      else conduct = mapped === 'NONE' ? null : mapped;
    }

    let source: PlanSource | null = null;
    const url = parseUrl(v.sourceUrl);
    if (url === null)
      issues.push({ field: 'sourceUrl', severity: 'WARNING', code: 'SOURCE_MISSING' });
    else if ('error' in url)
      issues.push({ field: 'sourceUrl', severity: 'ERROR', code: url.error });
    else {
      source = { url: url.url, host: url.host, title: v.sourceTitle?.trim() || null };
      issues.push({ field: 'sourceUrl', severity: 'INFO', code: 'SOURCE_UNVERIFIED' });
    }

    const alternatives = splitAlternatives(v.alternative).map((name) => {
      const key = normaliseForSearch(name);
      const matches = library.byName.get(key) ?? [];
      return {
        name,
        key,
        substance: matches.length === 1 ? matches[0]! : null,
        ambiguous: matches.length > 1,
      };
    });
    for (const alternative of alternatives) {
      if (alternative.key === substanceKey)
        issues.push({ field: 'alternative', severity: 'ERROR', code: 'ALTERNATIVE_SELF' });
      else if (alternative.ambiguous)
        issues.push({
          field: 'alternative',
          severity: 'WARNING',
          code: 'ALTERNATIVE_AMBIGUOUS',
          params: { name: alternative.name },
        });
      else if (!alternative.substance && !inFile.has(alternative.key))
        issues.push({
          field: 'alternative',
          severity: 'WARNING',
          code: 'ALTERNATIVE_UNRESOLVED',
          params: { name: alternative.name },
        });
    }

    // Against the library: an open version of someone else, or in review, cannot be changed.
    let skip = false;
    if (existing?.open) {
      if (existing.open.status === 'IN_REVIEW')
        issues.push({ field: 'substance', severity: 'ERROR', code: 'VERSION_IN_REVIEW' });
      else if (existing.open.authoredById !== authorId)
        issues.push({ field: 'substance', severity: 'ERROR', code: 'DRAFT_OF_ANOTHER_AUTHOR' });
    }
    if (existing && targets.length > 0 && reportedStatus) {
      const current = existing.open?.content ?? existing.published;
      const differs = targets.some((target) => {
        const period = existingPeriod(current, target);
        return (
          period !== null &&
          (period.conduct !== conduct || (period.reportedStatus ?? null) !== reportedStatus)
        );
      });
      if (differs) {
        if (row.resolution === null)
          issues.push({ field: 'row', severity: 'ERROR', code: 'CONFLICT_UNRESOLVED' });
        else
          issues.push({
            field: 'row',
            severity: 'INFO',
            code: row.resolution === 'SKIP' ? 'CONFLICT_KEEP' : 'CONFLICT_UPDATE',
          });
        skip = row.resolution === 'SKIP';
      }
    }

    if (row.excluded) return { id: row.id, issues, plan: null };
    return {
      id: row.id,
      issues,
      plan: blocking(issues)
        ? null
        : {
            substanceKey,
            substanceName,
            existing,
            targets,
            conduct,
            reportedStatus,
            alternatives: alternatives.map(({ name, key, substance }) => ({
              name,
              key,
              substance,
            })),
            source,
            skip,
          },
    };
  });

  // Duplicates inside the file: the same drug and period twice.
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.excluded) return;
    const key = normaliseForSearch(row.values.substance ?? '');
    const period = parsePeriod(row.values.period);
    if (!key || 'error' in period) return;
    for (const target of period.targets) {
      const slot = `${key}|${target}`;
      const first = seen.get(slot);
      if (first === undefined) {
        seen.set(slot, index);
        continue;
      }
      for (const [i, other] of [
        [index, rows[first]!],
        [first, row],
      ] as const) {
        const target = checked[i]!;
        if (!target.issues.some((issue) => issue.code === 'DUPLICATE_ROW')) {
          target.issues.push({
            field: 'row',
            severity: 'ERROR',
            code: 'DUPLICATE_ROW',
            params: { row: other.rowNumber },
          });
          target.plan = null;
        }
      }
    }
  });
  return checked;
}

/** Counts shown at the top of the preview. */
export interface Summary {
  total: number;
  excluded: number;
  valid: number;
  errors: number;
  warnings: number;
  duplicates: number;
  conflicts: number;
  newSubstances: number;
}

/** Counts rows by state for the preview header. */
export function summarise(rows: RowInput[], checked: Pick<CheckedRow, 'issues'>[]): Summary {
  const live = rows.flatMap((row, index) =>
    row.excluded ? [] : [{ row, issues: checked[index]!.issues }],
  );
  const has = (issues: Issue[], test: (issue: Issue) => boolean) => issues.some(test);
  const clean = live.filter(({ issues }) => !has(issues, (i) => i.severity === 'ERROR'));
  return {
    total: rows.length,
    excluded: rows.length - live.length,
    valid: clean.length,
    errors: live.length - clean.length,
    warnings: live.filter(({ issues }) => has(issues, (i) => i.severity === 'WARNING')).length,
    duplicates: live.filter(({ issues }) => has(issues, (i) => i.code === 'DUPLICATE_ROW')).length,
    conflicts: live.filter(({ issues }) => has(issues, (i) => i.code.startsWith('CONFLICT_')))
      .length,
    newSubstances: new Set(
      clean
        .filter(({ issues }) => has(issues, (i) => i.code === 'SUBSTANCE_NEW'))
        .map(({ row }) => normaliseForSearch(row.values.substance ?? '')),
    ).size,
  };
}
