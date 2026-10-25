import type { MessageKey, Translate } from '@/i18n/messages';
import { PERIOD_LABELS, type PeriodKey } from './labels';

/** Fields of a profile named by the review gate (`pregnancy.content.ts`, `reviewProblems`). */
const FIELD_LABELS: Record<string, MessageKey> = {
  'evidence.level': 'admin.pregnancy.problem.fieldEvidence',
  conductDetail: 'admin.pregnancy.problem.fieldConductDetail',
  conductText: 'admin.pregnancy.problem.fieldConductText',
  sourceIds: 'admin.pregnancy.problem.fieldSources',
  alternatives: 'admin.pregnancy.problem.fieldAlternatives',
  unresolvedAlternatives: 'admin.pregnancy.problem.fieldAlternatives',
  conflict: 'admin.pregnancy.problem.fieldConflict',
};

/** Where a problem is: « 1er trimestre · Niveau de preuve », « Allaitement », « Sources ». */
function place(path: string, t: Translate): string {
  const parts: string[] = [];
  let rest = path;
  const period = /^pregnancy\.periods\.(T1|T2|T3|PERIPARTUM)\.?/.exec(rest);
  if (period) {
    parts.push(t(PERIOD_LABELS[period[1] as PeriodKey]));
    rest = rest.slice(period[0].length);
  } else if (rest.startsWith('pregnancy')) {
    parts.push(t('admin.pregnancy.sectionPregnancy'));
    rest = rest.replace(/^pregnancy\.?/, '');
  } else if (rest.startsWith('lactation')) {
    parts.push(t('admin.pregnancy.sectionLactation'));
    rest = rest.replace(/^lactation\.?/, '');
  } else if (rest === 'sources') {
    return t('admin.pregnancy.problem.fieldVersionSources');
  }
  const field = FIELD_LABELS[rest];
  if (rest) parts.push(field ? t(field) : rest);
  return parts.join(' · ');
}

/** What is missing, in words; an unknown message (newer server) is shown as the server wrote it. */
function what(message: string, t: Translate): string {
  if (message === 'required') return t('admin.pregnancy.problem.required');
  if (message === 'at least one source is required') return t('admin.pregnancy.problem.oneSource');
  if (/^the (pregnancy|lactation) block is required$/.test(message))
    return t('admin.pregnancy.problem.blockRequired');
  if (message === 'explain the conduct in one sentence')
    return t('admin.pregnancy.problem.explainConduct');
  if (message === 'a substance is not its own alternative')
    return t('admin.pregnancy.problem.selfAlternative');
  if (message.startsWith('unknown substance'))
    return t('admin.pregnancy.problem.unknownAlternative');
  if (message === "cite this version's sources") return t('admin.pregnancy.problem.periodSources');
  if (message === "cite two of this version's sources")
    return t('admin.pregnancy.problem.conflictSources');
  const unresolved = /^link « (.+) » to a substance or remove it$/.exec(message);
  if (unresolved) return t('admin.pregnancy.problem.unresolved', { name: unresolved[1]! });
  return message;
}

/** « 1er trimestre · Niveau de preuve : à renseigner ». */
export function describeProblem(problem: string, t: Translate): string {
  const separator = problem.indexOf(': ');
  if (separator < 0) return problem;
  return `${place(problem.slice(0, separator), t)} : ${what(problem.slice(separator + 2), t)}`;
}
