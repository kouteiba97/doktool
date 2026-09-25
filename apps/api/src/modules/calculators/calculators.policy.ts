// Calculator governance rules (section 28, ADR-012).

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const NAME_MAX_LENGTH = 120;
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 1000;

/**
 * Audit actions that change a draft. An admin who performed any of them on a version may not
 * review or publish it (four-eyes, ADR-012 §6).
 */
export const DRAFTING_ACTIONS = [
  'calculator.version.created',
  'calculator.version.definition_saved',
  'calculator.version.source_added',
  'calculator.version.source_removed',
  'calculator.version.test_case_added',
  'calculator.version.test_case_removed',
  'calculator.version.submitted',
] as const;
