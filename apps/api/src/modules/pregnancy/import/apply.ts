// Writes accepted import rows into a profile draft (ADR-025). Each row touches only its periods:
// conduct and the status word as the source wrote it; its source and alternatives are added to
// that period. What an author already wrote there (explanations, evidence, population) is kept.
// Nothing is filled in that the sheet does not say: no evidence level, no explanation.
import type { ProfileContent } from '../pregnancy.content.js';
import type { CheckedRow, Target } from './rows.js';

export type RowPlan = NonNullable<CheckedRow['plan']>;

export interface Resolved {
  /** Source registry id for a URL. */
  sourceId: (url: string) => string;
  /** Substance id for an alternative name, when it is known for certain. */
  substanceId: (key: string) => string | null;
}

const union = <T>(current: T[] | undefined, added: T[]): T[] | undefined => {
  const all = [...new Set([...(current ?? []), ...added])];
  return all.length > 0 ? all : undefined;
};

const PREGNANCY_TARGETS = ['T1', 'T2', 'T3', 'PERIPARTUM'] as const;

export function applyRows(
  content: ProfileContent,
  plans: RowPlan[],
  resolved: Resolved,
): ProfileContent {
  const next: ProfileContent = structuredClone(content);
  for (const plan of plans) {
    if (plan.skip) continue;
    const sourceIds = plan.source ? [resolved.sourceId(plan.source.url)] : [];
    const linked: string[] = [];
    const unresolved: string[] = [];
    for (const alternative of plan.alternatives) {
      const id = alternative.substance?.id ?? resolved.substanceId(alternative.key);
      if (id) linked.push(id);
      else unresolved.push(alternative.name);
    }
    for (const target of plan.targets) apply(next, target, plan, sourceIds, linked, unresolved);
  }
  return next;
}

function apply(
  content: ProfileContent,
  target: Target,
  plan: RowPlan,
  sourceIds: string[],
  linked: string[],
  unresolved: string[],
): void {
  if (target === 'LACTATION') {
    const current = content.lactation ?? {
      conduct: null,
      evidence: { level: null },
      alternatives: [],
    };
    content.lactation = {
      ...current,
      conduct: plan.conduct,
      reportedStatus: plan.reportedStatus,
      sourceIds: union(current.sourceIds, sourceIds),
      alternatives: [...new Set([...current.alternatives, ...linked])],
      unresolvedAlternatives: union(current.unresolvedAlternatives, unresolved),
    };
    return;
  }
  const pregnancy = content.pregnancy ?? {
    periods: Object.fromEntries(PREGNANCY_TARGETS.map((key) => [key, null])) as NonNullable<
      ProfileContent['pregnancy']
    >['periods'],
    alternatives: [],
  };
  const current = pregnancy.periods[target] ?? { conduct: null, evidence: { level: null } };
  pregnancy.periods[target] = {
    ...current,
    conduct: plan.conduct,
    reportedStatus: plan.reportedStatus,
    sourceIds: union(current.sourceIds, sourceIds),
    alternatives: union(current.alternatives, linked),
    unresolvedAlternatives: union(current.unresolvedAlternatives, unresolved),
  };
  content.pregnancy = pregnancy;
}
