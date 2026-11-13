import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import type { BadgeTone } from '@/ui/badge';

/** API types used by the import pages. */
export type ImportPreview = Schemas['ImportPreviewDto'];
export type ImportRow = Schemas['ImportRowDto'];
export type ImportIssue = Schemas['ImportIssueDto'];
export type ImportListItem = Schemas['ImportListItemDto'];
export type RowFilter = Schemas['ImportRowFilter'];
export type StatusTarget = 'CONTRAINDICATED' | 'AVOID' | 'OCCASIONAL_USE' | 'NONE';

/** Cache keys of the import pages. */
export const importsKey = ['admin', 'pregnancy', 'imports'] as const;
export const importKey = (id: string) => ['admin', 'pregnancy', 'imports', id] as const;

/** The fields a column can be mapped to. */
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

/** Catalogue key of each field. */
export const FIELD_LABELS: Record<Field | 'ignore' | 'row', MessageKey> = {
  substance: 'admin.pregnancyImport.field.substance',
  context: 'admin.pregnancyImport.field.context',
  period: 'admin.pregnancyImport.field.period',
  status: 'admin.pregnancyImport.field.status',
  alternative: 'admin.pregnancyImport.field.alternative',
  sourceUrl: 'admin.pregnancyImport.field.sourceUrl',
  sourceTitle: 'admin.pregnancyImport.field.sourceTitle',
  ignore: 'admin.pregnancyImport.field.ignore',
  row: 'admin.pregnancyImport.field.row',
};

/** What a status word of the sheet can mean. */
export const STATUS_TARGETS: StatusTarget[] = [
  'CONTRAINDICATED',
  'AVOID',
  'OCCASIONAL_USE',
  'NONE',
];
/** Catalogue key of each meaning. */
export const STATUS_TARGET_LABELS: Record<StatusTarget, MessageKey> = {
  CONTRAINDICATED: 'admin.pregnancy.conductContraindicated',
  AVOID: 'admin.pregnancy.conductAvoid',
  OCCASIONAL_USE: 'admin.pregnancy.conductOccasional',
  NONE: 'admin.pregnancyImport.noBadge',
};

/** Row filters of the preview. */
export const FILTERS: RowFilter[] = [
  'ALL',
  'ERROR',
  'WARNING',
  'VALID',
  'DUPLICATE',
  'CONFLICT',
  'EXCLUDED',
];
/** Catalogue key of each filter. */
export const FILTER_LABELS: Record<RowFilter, MessageKey> = {
  ALL: 'admin.pregnancyImport.filter.all',
  ERROR: 'admin.pregnancyImport.filter.error',
  WARNING: 'admin.pregnancyImport.filter.warning',
  VALID: 'admin.pregnancyImport.filter.valid',
  DUPLICATE: 'admin.pregnancyImport.filter.duplicate',
  CONFLICT: 'admin.pregnancyImport.filter.conflict',
  EXCLUDED: 'admin.pregnancyImport.filter.excluded',
};

/** Catalogue key of each import status. */
export const STATUS_LABELS: Record<Schemas['ImportStatus'], MessageKey> = {
  PREVIEW: 'admin.pregnancyImport.status.preview',
  COMMITTED: 'admin.pregnancyImport.status.committed',
  DISCARDED: 'admin.pregnancyImport.status.discarded',
};
/** Badge colour of each import status. */
export const STATUS_TONES: Record<Schemas['ImportStatus'], BadgeTone> = {
  PREVIEW: 'info',
  COMMITTED: 'success',
  DISCARDED: 'outline',
};

const ISSUE_CODES = [
  'FORMULA_VALUE',
  'SUBSTANCE_MISSING',
  'SUBSTANCE_AMBIGUOUS',
  'SUBSTANCE_EXISTING',
  'SUBSTANCE_NEW',
  'PERIOD_MISSING',
  'PERIOD_UNKNOWN',
  'CONTEXT_UNKNOWN',
  'CONTEXT_PERIOD_MISMATCH',
  'STATUS_MISSING',
  'STATUS_UNMAPPED',
  'SOURCE_MISSING',
  'SOURCE_UNVERIFIED',
  'URL_INVALID',
  'URL_SCHEME',
  'URL_CREDENTIALS',
  'ALTERNATIVE_SELF',
  'ALTERNATIVE_AMBIGUOUS',
  'ALTERNATIVE_UNRESOLVED',
  'VERSION_IN_REVIEW',
  'DRAFT_OF_ANOTHER_AUTHOR',
  'CONFLICT_UNRESOLVED',
  'CONFLICT_KEEP',
  'CONFLICT_UPDATE',
  'DUPLICATE_ROW',
] as const;

/** Message key of an issue code; an unknown code (newer server) falls back to a generic text. */
export function issueKey(code: string): MessageKey {
  if (!(ISSUE_CODES as readonly string[]).includes(code))
    return 'admin.pregnancyImport.issue.unknown';
  const camel = code
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return `admin.pregnancyImport.issue.${camel}` as MessageKey;
}

/** The row's technical state in one word: never colour alone. */
export function rowState(row: ImportRow): { tone: BadgeTone; key: MessageKey } {
  if (row.excluded) return { tone: 'outline', key: 'admin.pregnancyImport.state.excluded' };
  if (row.issues.some((i) => i.severity === 'ERROR'))
    return { tone: 'critical', key: 'admin.pregnancyImport.state.error' };
  if (row.issues.some((i) => i.severity === 'WARNING'))
    return { tone: 'warning', key: 'admin.pregnancyImport.state.warning' };
  return { tone: 'success', key: 'admin.pregnancyImport.state.valid' };
}

/** Badge colour of each issue severity. */
export const SEVERITY_TONES: Record<string, BadgeTone> = {
  ERROR: 'critical',
  WARNING: 'warning',
  INFO: 'neutral',
};
/** Catalogue key of each issue severity. */
export const SEVERITY_LABELS: Record<string, MessageKey> = {
  ERROR: 'admin.pregnancyImport.severity.error',
  WARNING: 'admin.pregnancyImport.severity.warning',
  INFO: 'admin.pregnancyImport.severity.info',
};
