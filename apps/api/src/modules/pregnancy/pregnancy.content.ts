// The structured content of a pregnancy · lactation profile (ADR-019, design system section 25
// Appendix B, components ScreenPregnancyDesktop, ScreenLactationMobile, EvidenceBlock).
// Conduct ("what to do") and evidence ("how sure") are separate fields; there is no safe/unsafe
// verdict anywhere in the model.
import { z } from 'zod';

const MAX_TEXT = 2000;

/** Authored text: French required, English optional (the app falls back to French). */
const localized = z
  .object({
    fr: z.string().trim().min(1).max(MAX_TEXT),
    en: z.string().trim().min(1).max(MAX_TEXT).optional(),
  })
  .strict();
export type LocalizedText = z.infer<typeof localized>;

/** The clinical instructions shown as a badge (icon + word); anything else has no badge. */
export const CONDUCTS = ['CONTRAINDICATED', 'AVOID', 'OCCASIONAL_USE'] as const;
export type Conduct = (typeof CONDUCTS)[number];

/** 4 Données robustes · 3 modérées · 2 limitées · 1 très limitées · 0 Absence de données. */
export const EVIDENCE_LEVELS = [0, 1, 2, 3, 4] as const;
const evidence = z
  .object({
    level: z.number().int().min(0).max(4),
    /** « cohortes et séries concordantes », « < 100 grossesses exposées »… */
    population: localized.optional(),
  })
  .strict();

/** Two references that disagree, and the reviewers' synthesis (info Alert). */
const conflict = z
  .object({
    sourceIds: z.array(z.uuid()).length(2),
    synthesis: localized,
  })
  .strict();

const period = z
  .object({
    conduct: z.enum(CONDUCTS).nullable(),
    /** One sentence: « Contre-indiqué à partir de 24 SA (5e mois révolu) ». */
    conductDetail: localized.optional(),
    riskContext: localized.optional(),
    evidence,
    considerations: localized.optional(),
  })
  .strict();
export type PregnancyPeriod = z.infer<typeof period>;

export const PERIODS = ['T1', 'T2', 'T3', 'PERIPARTUM'] as const;
export type PeriodKey = (typeof PERIODS)[number];

const alternatives = z.array(z.uuid()).max(10);

const pregnancy = z
  .object({
    periods: z
      .object({
        T1: period.nullable(),
        T2: period.nullable(),
        T3: period.nullable(),
        PERIPARTUM: period.nullable(),
      })
      .strict(),
    alternatives,
    conflict: conflict.optional(),
  })
  .strict();

const lactation = z
  .object({
    conduct: z.enum(CONDUCTS).nullable(),
    /** Conduct first, in one sentence: « Compatible avec l'allaitement. Surveiller les selles. » */
    conductText: localized.optional(),
    /** Relative infant dose as the source states it: « 0,5 – 1 % ». */
    relativeInfantDose: z.string().trim().min(1).max(40).optional(),
    /** « 1 – 1,5 h ». */
    maternalHalfLife: z.string().trim().min(1).max(40).optional(),
    reportedEffects: localized.optional(),
    /** Premature infants, infants under one month. */
    specialPopulations: localized.optional(),
    evidence,
    considerations: localized.optional(),
    alternatives,
    conflict: conflict.optional(),
  })
  .strict();

export const profileContentSchema = z
  .object({ pregnancy: pregnancy.nullable(), lactation: lactation.nullable() })
  .strict();
export type ProfileContent = z.infer<typeof profileContentSchema>;

/** A new profile starts empty: both blocks are filled by the author. */
export const EMPTY_CONTENT: ProfileContent = { pregnancy: null, lactation: null };

/**
 * What still prevents a version from going to review. A draft may be saved incomplete; review needs
 * a complete profile: both blocks, every period, a conduct sentence where a period has a badge, the
 * conduct sentence of lactation, at least one source, conflicts citing the version's own sources,
 * and alternatives that are other substances. « Absence de données » (level 0) is a complete answer.
 */
export function reviewProblems(
  content: ProfileContent,
  context: {
    substanceId: string;
    sourceIds: readonly string[];
    knownSubstanceIds: ReadonlySet<string>;
  },
): string[] {
  const problems: string[] = [];
  if (context.sourceIds.length === 0) problems.push('sources: at least one source is required');
  const checkAlternatives = (where: string, ids: readonly string[]) => {
    for (const id of ids) {
      if (id === context.substanceId)
        problems.push(`${where}.alternatives: a substance is not its own alternative`);
      else if (!context.knownSubstanceIds.has(id))
        problems.push(`${where}.alternatives: unknown substance ${id}`);
    }
  };
  const checkConflict = (where: string, value: { sourceIds: string[] } | undefined) => {
    if (value && value.sourceIds.some((id) => !context.sourceIds.includes(id))) {
      problems.push(`${where}.conflict: cite two of this version's sources`);
    }
  };

  if (!content.pregnancy) {
    problems.push('pregnancy: the pregnancy block is required');
  } else {
    for (const key of PERIODS) {
      const value = content.pregnancy.periods[key];
      if (!value) problems.push(`pregnancy.periods.${key}: required`);
      else if (value.conduct && !value.conductDetail) {
        problems.push(
          `pregnancy.periods.${key}.conductDetail: explain the conduct in one sentence`,
        );
      }
    }
    checkAlternatives('pregnancy', content.pregnancy.alternatives);
    checkConflict('pregnancy', content.pregnancy.conflict);
  }

  if (!content.lactation) {
    problems.push('lactation: the lactation block is required');
  } else {
    if (!content.lactation.conductText) problems.push('lactation.conductText: required');
    checkAlternatives('lactation', content.lactation.alternatives);
    checkConflict('lactation', content.lactation.conflict);
  }
  return problems;
}

/** The substances a profile links to as alternatives. */
export function alternativeIds(content: ProfileContent): string[] {
  return [
    ...new Set([
      ...(content.pregnancy?.alternatives ?? []),
      ...(content.lactation?.alternatives ?? []),
    ]),
  ];
}
