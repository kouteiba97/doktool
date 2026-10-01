import type { MessageKey, Translate } from '@/i18n/messages';

/** Audited actions as people read them; unknown codes are shown as-is (mono) by the caller. */
const ACTIONS: Record<string, MessageKey> = {
  'admin.account.created': 'admin.audit.actions.adminAccountCreated',
  'admin.grant.temporary': 'admin.audit.actions.adminGrantTemporary',
  'admin.grants.updated': 'admin.audit.actions.adminGrantsUpdated',
  'admin.reinstated': 'admin.audit.actions.adminReinstated',
  'admin.suspended': 'admin.audit.actions.adminSuspended',
  'admin.sign_in.locked': 'admin.audit.actions.adminSignInLocked',
  'admin.sign_in.password_rejected': 'admin.audit.actions.adminSignInPasswordRejected',
  'admin.sign_in.refused_suspended': 'admin.audit.actions.adminSignInRefusedSuspended',
  'admin.sign_in.succeeded': 'admin.audit.actions.adminSignInSucceeded',
  'admin.sign_out': 'admin.audit.actions.adminSignOut',
  'admin.totp.enrolled': 'admin.audit.actions.adminTotpEnrolled',
  'admin.totp.rejected': 'admin.audit.actions.adminTotpRejected',
  'admin.totp.reset': 'admin.audit.actions.adminTotpReset',
  'audit.exported': 'admin.audit.actions.auditExported',
  'calculator.created': 'admin.audit.actions.calculatorCreated',
  'calculator.updated': 'admin.audit.actions.calculatorUpdated',
  'calculator.version.created': 'admin.audit.actions.calculatorVersionCreated',
  'calculator.version.definition_saved': 'admin.audit.actions.calculatorVersionDefinitionSaved',
  'calculator.version.discarded': 'admin.audit.actions.calculatorVersionDiscarded',
  'calculator.version.published': 'admin.audit.actions.calculatorVersionPublished',
  'calculator.version.retired': 'admin.audit.actions.calculatorVersionRetired',
  'calculator.version.returned': 'admin.audit.actions.calculatorVersionReturned',
  'calculator.version.source_added': 'admin.audit.actions.calculatorVersionSourceAdded',
  'calculator.version.source_removed': 'admin.audit.actions.calculatorVersionSourceRemoved',
  'calculator.version.submitted': 'admin.audit.actions.calculatorVersionSubmitted',
  'calculator.version.test_case_added': 'admin.audit.actions.calculatorVersionTestCaseAdded',
  'calculator.version.test_case_removed': 'admin.audit.actions.calculatorVersionTestCaseRemoved',
  'calculator.version.tests_run': 'admin.audit.actions.calculatorVersionTestsRun',
  'finance.adjustment.approved': 'admin.audit.actions.financeAdjustmentApproved',
  'finance.adjustment.requested': 'admin.audit.actions.financeAdjustmentRequested',
  'finance.expense.created': 'admin.audit.actions.financeExpenseCreated',
  'finance.expense.voided': 'admin.audit.actions.financeExpenseVoided',
  'finance.fee_rate.updated': 'admin.audit.actions.financeFeeRateUpdated',
  'finance.fees.settled': 'admin.audit.actions.financeFeesSettled',
  'finance.report.exported': 'admin.audit.actions.financeReportExported',
  'plan.sale_started': 'admin.audit.actions.planSaleStarted',
  'plan.sale_stopped': 'admin.audit.actions.planSaleStopped',
  'plan.version_published': 'admin.audit.actions.planVersionPublished',
  'reference.created': 'admin.audit.actions.referenceCreated',
  'reference.updated': 'admin.audit.actions.referenceUpdated',
  'reference.enabled': 'admin.audit.actions.referenceEnabled',
  'reference.disabled': 'admin.audit.actions.referenceDisabled',
  'reference.archived': 'admin.audit.actions.referenceArchived',
  'reference.restored': 'admin.audit.actions.referenceRestored',
  'reference.file.replaced': 'admin.audit.actions.referenceFileReplaced',
  'reference.file.processed': 'admin.audit.actions.referenceFileProcessed',
  'reference.file.failed': 'admin.audit.actions.referenceFileFailed',
  'reference_data.specialty_created': 'admin.audit.actions.referenceDataSpecialtyCreated',
  'reference_data.institution_created': 'admin.audit.actions.referenceDataInstitutionCreated',
  'reference_data.university_created': 'admin.audit.actions.referenceDataUniversityCreated',
  'search.synonyms_replaced': 'admin.audit.actions.searchSynonymsReplaced',
  'user.reinstated': 'admin.audit.actions.userReinstated',
  'user.sessions_revoked': 'admin.audit.actions.userSessionsRevoked',
  'user.suspended': 'admin.audit.actions.userSuspended',
  'verification.approved': 'admin.audit.actions.verificationApproved',
  'verification.rejected': 'admin.audit.actions.verificationRejected',
  'verification.appeal_approved': 'admin.audit.actions.verificationAppealApproved',
  'verification.appeal_rejected': 'admin.audit.actions.verificationAppealRejected',
  'verification.claimed': 'admin.audit.actions.verificationClaimed',
  'verification.released': 'admin.audit.actions.verificationReleased',
  'verification.document_viewed': 'admin.audit.actions.verificationDocumentViewed',
};

/** Identity-document views and exceptional adjustments are highlighted in the log (section 07). */
export function isSensitiveAction(action: string): boolean {
  return action === 'verification.document_viewed' || action.startsWith('finance.adjustment.');
}

export function hasActionLabel(action: string): boolean {
  return action in ACTIONS;
}

export function actionLabel(t: Translate, action: string): string {
  const key = ACTIONS[action];
  return key ? t(key) : action;
}

/** Action prefixes offered in the log's filter. */
export const ACTION_GROUPS: { prefix: string; label: MessageKey }[] = [
  { prefix: 'verification.', label: 'admin.audit.groupVerification' },
  { prefix: 'reference.', label: 'admin.audit.groupLibrary' },
  { prefix: 'calculator.', label: 'admin.audit.groupCalculators' },
  { prefix: 'plan.', label: 'admin.audit.groupPlans' },
  { prefix: 'finance.', label: 'admin.audit.groupFinance' },
  { prefix: 'user.', label: 'admin.audit.groupUsers' },
  { prefix: 'admin.', label: 'admin.audit.groupAdmins' },
];
