import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import type { Grant } from '@/session/session';

export type Preset = Schemas['AdminPreset'];

/**
 * Every grant with its label, in section 03 order. Typed as a record of the API's grant enum,
 * so a grant added to the contract fails the build until it is labelled here.
 */
export const GRANT_LABELS: Record<Grant, MessageKey> = {
  'users.read': 'admin.permissions.grants.usersRead',
  'users.write': 'admin.permissions.grants.usersWrite',
  'users.suspend': 'admin.permissions.grants.usersSuspend',
  'verification.queue.read': 'admin.permissions.grants.verificationQueueRead',
  'verification.review': 'admin.permissions.grants.verificationReview',
  'verification.documents.view': 'admin.permissions.grants.verificationDocumentsView',
  'verification.appeal.decide': 'admin.permissions.grants.verificationAppealDecide',
  'library.read': 'admin.permissions.grants.libraryRead',
  'library.write': 'admin.permissions.grants.libraryWrite',
  'library.disable': 'admin.permissions.grants.libraryDisable',
  'calculators.read': 'admin.permissions.grants.calculatorsRead',
  'calculators.draft': 'admin.permissions.grants.calculatorsDraft',
  'calculators.review': 'admin.permissions.grants.calculatorsReview',
  'calculators.publish': 'admin.permissions.grants.calculatorsPublish',
  'calculators.retire': 'admin.permissions.grants.calculatorsRetire',
  'pregnancy.read': 'admin.permissions.grants.pregnancyRead',
  'pregnancy.draft': 'admin.permissions.grants.pregnancyDraft',
  'pregnancy.review': 'admin.permissions.grants.pregnancyReview',
  'subscriptions.read': 'admin.permissions.grants.subscriptionsRead',
  'subscriptions.plans.write': 'admin.permissions.grants.subscriptionsPlansWrite',
  'transactions.read': 'admin.permissions.grants.transactionsRead',
  'transactions.adjustment.request': 'admin.permissions.grants.transactionsAdjustmentRequest',
  'transactions.adjustment.approve': 'admin.permissions.grants.transactionsAdjustmentApprove',
  'finance.read': 'admin.permissions.grants.financeRead',
  'finance.expenses.write': 'admin.permissions.grants.financeExpensesWrite',
  'finance.reports.export': 'admin.permissions.grants.financeReportsExport',
  'analytics.read': 'admin.permissions.grants.analyticsRead',
  'analytics.export': 'admin.permissions.grants.analyticsExport',
  'audit.read': 'admin.permissions.grants.auditRead',
  'audit.export': 'admin.permissions.grants.auditExport',
  'system.roles.write': 'admin.permissions.grants.systemRolesWrite',
  'system.settings.write': 'admin.permissions.grants.systemSettingsWrite',
  'system.notifications.send': 'admin.permissions.grants.systemNotificationsSend',
  'system.demo.configure': 'admin.permissions.grants.systemDemoConfigure',
};

export const ALL_GRANTS = Object.keys(GRANT_LABELS) as Grant[];

/** Grants grouped by their domain (the part before the first dot). */
export const GRANT_GROUPS: { domain: string; label: MessageKey; grants: Grant[] }[] = [
  { domain: 'users', label: 'admin.nav.users' },
  { domain: 'verification', label: 'admin.nav.verification' },
  { domain: 'library', label: 'admin.nav.referenceLibrary' },
  { domain: 'calculators', label: 'admin.nav.calculators' },
  { domain: 'pregnancy', label: 'admin.nav.pregnancy' },
  { domain: 'subscriptions', label: 'admin.nav.subscriptions' },
  { domain: 'transactions', label: 'admin.nav.transactions' },
  { domain: 'finance', label: 'admin.nav.finance' },
  { domain: 'analytics', label: 'admin.nav.analytics' },
  { domain: 'audit', label: 'admin.nav.audit' },
  { domain: 'system', label: 'admin.nav.system' },
].map((group) => ({
  ...(group as { domain: string; label: MessageKey }),
  grants: ALL_GRANTS.filter((grant) => grant.split('.')[0] === group.domain),
}));

export const PRESET_LABELS: Record<Preset, MessageKey> = {
  SUPER_ADMIN: 'admin.permissions.presets.superAdmin',
  VERIFICATION_REVIEWER: 'admin.permissions.presets.verificationReviewer',
  LIBRARY_MANAGER: 'admin.permissions.presets.libraryManager',
  CALCULATOR_EDITOR: 'admin.permissions.presets.calculatorEditor',
  CLINICAL_REVIEWER: 'admin.permissions.presets.clinicalReviewer',
  FINANCE_ADMIN: 'admin.permissions.presets.financeAdmin',
  ANALYST: 'admin.permissions.presets.analyst',
};

/**
 * Section 03 separation of duties, checked before saving (the API checks again): finance never
 * goes with calculators or the library, and only the Super Admin approves adjustments.
 */
export function separationProblems(grants: readonly Grant[]): MessageKey[] {
  if (ALL_GRANTS.every((grant) => grants.includes(grant))) return [];
  const problems: MessageKey[] = [];
  const has = (prefix: string) => grants.some((grant) => grant.startsWith(prefix));
  if (has('finance.') && (has('calculators.') || has('library.') || has('pregnancy.'))) {
    problems.push('admin.permissions.ruleFinanceContent');
  }
  if (grants.includes('transactions.adjustment.approve'))
    problems.push('admin.permissions.ruleApproveSuperOnly');
  return problems;
}

export const adminsKey = ['admin', 'admins'] as const;
