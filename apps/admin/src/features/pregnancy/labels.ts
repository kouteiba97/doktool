import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import type { BadgeTone } from '@/ui/badge';

/** API types used by the pregnancy pages. */
export type Substance = Schemas['AdminSubstanceDto'];
export type SubstanceDetail = Schemas['AdminSubstanceDetailDto'];
export type ProfileVersion = Schemas['AdminProfileVersionDto'];
export type VersionStatus = Schemas['ProfileVersionStatus'];
export type ClinicalSource = Schemas['ClinicalSourceDto'];
export type SourceType = Schemas['ClinicalSourceType'];
export type ContentReport = Schemas['AdminContentReportDto'];
export type Conduct = Schemas['Conduct'];
export type ProfileContent = Schemas['ProfileContentDto'];
export type PregnancyBlock = Schemas['PregnancyBlockDto'];
export type LactationBlock = Schemas['LactationBlockDto'];
export type Period = Schemas['PregnancyPeriodDto'];
export type Localized = Schemas['ProfileTextDto'];

/** Cache keys of the pregnancy pages. */
export const substancesKey = ['admin', 'pregnancy', 'substances'] as const;
export const substanceKey = (id: string) => ['admin', 'pregnancy', 'substances', id] as const;
export const versionKey = (id: string) => ['admin', 'pregnancy', 'versions', id] as const;
export const sourcesKey = ['admin', 'pregnancy', 'sources'] as const;
export const reportsKey = ['admin', 'pregnancy', 'reports'] as const;

/** The four pregnancy periods, in order. */
export const PERIODS = ['T1', 'T2', 'T3', 'PERIPARTUM'] as const;
export type PeriodKey = (typeof PERIODS)[number];

/** Catalogue key of each period. */
export const PERIOD_LABELS: Record<PeriodKey, MessageKey> = {
  T1: 'admin.pregnancy.periodT1',
  T2: 'admin.pregnancy.periodT2',
  T3: 'admin.pregnancy.periodT3',
  PERIPARTUM: 'admin.pregnancy.periodPeripartum',
};

/** Conducts a period can state (or none). */
export const CONDUCTS: Conduct[] = ['CONTRAINDICATED', 'AVOID', 'OCCASIONAL_USE'];

/** A clinical instruction (icon + word); never a safe/unsafe verdict. */
export const CONDUCT_LABELS: Record<Conduct, MessageKey> = {
  CONTRAINDICATED: 'admin.pregnancy.conductContraindicated',
  AVOID: 'admin.pregnancy.conductAvoid',
  OCCASIONAL_USE: 'admin.pregnancy.conductOccasional',
};

/** Evidence strength is neutral: the word carries the meaning, never a colour (Lock L6). */
export const EVIDENCE_LABELS: Record<number, MessageKey> = {
  4: 'admin.pregnancy.evidence4',
  3: 'admin.pregnancy.evidence3',
  2: 'admin.pregnancy.evidence2',
  1: 'admin.pregnancy.evidence1',
  0: 'admin.pregnancy.evidence0',
};

/** Catalogue key of each version status. */
export const VERSION_STATUS_LABELS: Record<VersionStatus, MessageKey> = {
  DRAFT: 'admin.pregnancy.statusDraft',
  IN_REVIEW: 'admin.pregnancy.statusInReview',
  CHANGES_REQUESTED: 'admin.pregnancy.statusChangesRequested',
  PUBLISHED: 'admin.pregnancy.statusPublished',
  SUPERSEDED: 'admin.pregnancy.statusSuperseded',
};

/** Badge colour of each version status. */
export const VERSION_STATUS_TONES: Record<VersionStatus, BadgeTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  CHANGES_REQUESTED: 'info',
  PUBLISHED: 'success',
  SUPERSEDED: 'outline',
};

/** Kinds of source. */
export const SOURCE_TYPES: SourceType[] = [
  'REFERENCE',
  'REGULATORY',
  'GUIDELINE',
  'LITERATURE',
  'NATIONAL_FORMULARY',
];

/** Catalogue key of each kind of source. */
export const SOURCE_TYPE_LABELS: Record<SourceType, MessageKey> = {
  REFERENCE: 'admin.pregnancy.sourceReference',
  REGULATORY: 'admin.pregnancy.sourceRegulatory',
  GUIDELINE: 'admin.pregnancy.sourceGuideline',
  LITERATURE: 'admin.pregnancy.sourceLiterature',
  NATIONAL_FORMULARY: 'admin.pregnancy.sourceNationalFormulary',
};

/** Catalogue key of each section a report points at. */
export const SECTION_LABELS: Record<Schemas['ProfileSection'], MessageKey> = {
  PREGNANCY: 'admin.pregnancy.sectionPregnancy',
  LACTATION: 'admin.pregnancy.sectionLactation',
};

/** Catalogue key of each report reason. */
export const REPORT_REASON_LABELS: Record<Schemas['ContentReportReason'], MessageKey> = {
  INCORRECT: 'admin.pregnancy.reasonIncorrect',
  OUTDATED: 'admin.pregnancy.reasonOutdated',
  UNCLEAR: 'admin.pregnancy.reasonUnclear',
  OTHER: 'admin.pregnancy.reasonOther',
};

/** « CRAT · 09/2026 », the way the evidence footer cites a source. */
export function sourceCitation(source: ClinicalSource): string {
  const when = source.edition ?? (source.year ? String(source.year) : null);
  return when ? `${source.title} ${when}` : source.title;
}

/** True for a version not decided yet. */
export function isOpenStatus(status: VersionStatus): boolean {
  return status === 'DRAFT' || status === 'IN_REVIEW' || status === 'CHANGES_REQUESTED';
}

/** True for a version its author may still edit. */
export function isEditable(status: VersionStatus): boolean {
  return status === 'DRAFT' || status === 'CHANGES_REQUESTED';
}

/** The French text, or English in the English console when it was written. */
export function localized(text: Localized | undefined, locale: string): string | null {
  if (!text) return null;
  return locale === 'en' && text.en ? text.en : text.fr;
}

/** A period with nothing stated. */
export function emptyPeriod(): Period {
  return { conduct: null, evidence: { level: 0 } };
}

/** A pregnancy block with four empty periods. */
export function emptyPregnancy(): PregnancyBlock {
  return {
    periods: {
      T1: emptyPeriod(),
      T2: emptyPeriod(),
      T3: emptyPeriod(),
      PERIPARTUM: emptyPeriod(),
    },
    alternatives: [],
  };
}

/** A lactation block with nothing stated. */
export function emptyLactation(): LactationBlock {
  return { conduct: null, evidence: { level: 0 }, alternatives: [] };
}
