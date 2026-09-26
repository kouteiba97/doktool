import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import type { BadgeTone } from '@/ui/badge';
import type { DefinitionView, StoredTestRun } from './definition';

export type Calculator = Schemas['AdminCalculatorDto'];
export type Version = Schemas['AdminVersionDto'];
export type VersionStatus = Schemas['CalculatorVersionStatus'];
export type SourceRole = Schemas['CalculatorSourceRole'];
export type TestOutcome = Schemas['CalculatorTestOutcome'];
export type AccessTier = Schemas['AccessTier'];

/** Same pattern as the API (lowercase words joined by hyphens). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const NAME_MAX_LENGTH = 120;
export const PURPOSE_MAX_LENGTH = 160;
export const CATEGORY_MAX_LENGTH = 60;

export const calculatorsKey = ['admin', 'calculators'] as const;
export const calculatorKey = (id: string) => ['admin', 'calculators', id] as const;

export const VERSION_STATUS_LABELS: Record<VersionStatus, MessageKey> = {
  DRAFT: 'admin.calculators.versionDraft',
  IN_REVIEW: 'admin.calculators.versionInReview',
  PUBLISHED: 'admin.calculators.versionPublished',
  RETIRED: 'admin.calculators.versionRetired',
};

export const VERSION_STATUS_TONES: Record<VersionStatus, BadgeTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  PUBLISHED: 'success',
  RETIRED: 'outline',
};

export const CALCULATOR_STATUS_LABELS: Record<Schemas['CalculatorStatus'], MessageKey> = {
  ACTIVE: 'admin.calculators.statusActive',
  RETIRED: 'admin.calculators.statusRetired',
};

export const ACCESS_LABELS: Record<AccessTier, MessageKey> = {
  STUDENT: 'admin.calculators.accessStudent',
  PROFESSIONAL: 'admin.calculators.accessProfessional',
};

export const ROLE_LABELS: Record<SourceRole, MessageKey> = {
  PRIMARY: 'admin.calculators.rolePrimary',
  VALIDATION: 'admin.calculators.roleValidation',
  UNIT_CONVERSION: 'admin.calculators.roleUnitConversion',
};

export const OUTCOME_LABELS: Record<TestOutcome, MessageKey> = {
  RESULT: 'admin.calculators.outcomeResult',
  INVALID: 'admin.calculators.outcomeInvalid',
  OUT_OF_VALIDATED_RANGE: 'admin.calculators.outcomeOutOfRange',
};

/** The version shown to users (current published one), if any. */
export function publishedVersion(calculator: Calculator): Version | undefined {
  return calculator.versions.find((version) => version.id === calculator.currentVersionId);
}

export function openDraft(calculator: Calculator): Version | undefined {
  return calculator.versions.find(
    (version) => version.status === 'DRAFT' || version.status === 'IN_REVIEW',
  );
}

export interface Gate {
  label: MessageKey;
  ok: boolean;
}

/**
 * The publication gate of section 28, as the reviewer sees it before acting (the API enforces it
 * again, with the four-eyes rule on who drafted the version).
 */
export function publicationGates(
  version: Version,
  definition: DefinitionView | null,
  run: StoredTestRun | null,
  reviewerId: string | undefined,
): Gate[] {
  const converts =
    definition?.inputs.some(
      (input) => (input.kind === 'NUMBER' || input.kind === 'INTEGER') && input.units.length > 0,
    ) ?? false;
  const gates: Gate[] = [
    {
      label: 'admin.calculators.gatePrimary',
      ok: version.sources.some((source) => source.role === 'PRIMARY'),
    },
  ];
  if (converts) {
    gates.push({
      label: 'admin.calculators.gateUnitSource',
      ok: version.sources.some((source) => source.role === 'UNIT_CONVERSION'),
    });
  }
  gates.push(
    { label: 'admin.calculators.gateTestCases', ok: version.testCases.length > 0 },
    { label: 'admin.calculators.gateTestsPass', ok: run?.passed === true },
    {
      label: 'admin.calculators.gateReviewer',
      ok: reviewerId !== undefined && reviewerId !== version.authoredBy.id,
    },
  );
  return gates;
}
