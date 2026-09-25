// V1 admin grant catalogue and presets (design system section 03). There is no refund grant.

export const GRANTS = [
  'users.read',
  'users.write',
  'users.suspend',
  'verification.queue.read',
  'verification.review',
  'verification.documents.view',
  'verification.appeal.decide',
  'library.read',
  'library.write',
  'library.disable',
  'calculators.read',
  'calculators.draft',
  'calculators.review',
  'calculators.publish',
  'calculators.retire',
  'subscriptions.read',
  'subscriptions.plans.write',
  'transactions.read',
  'transactions.adjustment.request',
  'transactions.adjustment.approve',
  'finance.read',
  'finance.expenses.write',
  'finance.reports.export',
  'analytics.read',
  'analytics.export',
  'audit.read',
  'audit.export',
  'system.roles.write',
  'system.settings.write',
  'system.notifications.send',
  'system.demo.configure',
] as const;

export type Grant = (typeof GRANTS)[number];

export const PRESETS = {
  SUPER_ADMIN: [...GRANTS],
  /** `verification.documents.view` is granted separately, time-limited (default 2 h). */
  VERIFICATION_REVIEWER: ['verification.queue.read', 'verification.review'],
  LIBRARY_MANAGER: ['library.read', 'library.write', 'library.disable'],
  CALCULATOR_EDITOR: ['calculators.read', 'calculators.draft'],
  CLINICAL_REVIEWER: ['calculators.read', 'calculators.review', 'calculators.publish'],
  FINANCE_ADMIN: [
    'finance.read',
    'transactions.read',
    'finance.expenses.write',
    'finance.reports.export',
    'subscriptions.read',
  ],
  ANALYST: ['analytics.read', 'analytics.export'],
} as const satisfies Record<string, readonly Grant[]>;

export type Preset = keyof typeof PRESETS;

export function isGrant(value: string): value is Grant {
  return (GRANTS as readonly string[]).includes(value);
}

/**
 * Separation of duties for sub-admins (section 03): no account holds both finance grants and
 * clinical content grants, and only the Super Admin may approve exceptional adjustments.
 * Returns the violated rules (empty = allowed).
 */
export function separationOfDutiesViolations(
  grants: readonly Grant[],
  isSuperAdmin: boolean,
): string[] {
  if (isSuperAdmin) return [];
  const violations: string[] = [];
  const has = (prefix: string) => grants.some((grant) => grant.startsWith(prefix));
  if (has('finance.') && (has('calculators.') || has('library.'))) {
    violations.push('finance grants cannot be combined with calculators or library grants');
  }
  if (grants.includes('transactions.adjustment.approve')) {
    violations.push('only the Super Admin approves exceptional adjustments');
  }
  return violations;
}
