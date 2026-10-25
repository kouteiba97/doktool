import type { Schemas } from '@/api/client';
import type { MessageKey, Translate } from '@/i18n/messages';

/** Access tiers, as the API names them. */
export type EntitlementTier = Schemas['EntitlementTier'];
export type FeatureKey = Schemas['FeatureKey'];
export type LockReason = Schemas['LockReason'];

/** Catalogue key of each tier's name. */
export const TIER_LABELS: Record<EntitlementTier, MessageKey> = {
  DEMO: 'admin.users.tierDemo',
  STUDENT: 'admin.users.tierStudent',
  PROFESSIONAL_UNPAID: 'admin.users.tierProfessionalUnpaid',
  PROFESSIONAL: 'admin.users.tierProfessional',
  RESTRICTED: 'admin.users.tierRestricted',
};

/** Catalogue key of each feature's name. */
export const FEATURE_LABELS: Record<FeatureKey, MessageKey> = {
  search: 'admin.users.featureSearch',
  'reference.view': 'admin.users.featureReferenceView',
  'calculator.use': 'admin.users.featureCalculatorUse',
  'pregnancy.view': 'admin.users.featurePregnancyView',
  favorites: 'admin.users.featureFavorites',
  'activity.history': 'admin.users.featureActivityHistory',
  'offline.sync': 'admin.users.featureOfflineSync',
  'subscription.purchase': 'admin.users.featureSubscriptionPurchase',
  'profile.edit': 'admin.users.featureProfileEdit',
};

/** Catalogue key of each lock reason. */
export const LOCK_REASON_LABELS: Record<LockReason, MessageKey> = {
  DEMO_LIMIT: 'admin.users.lockDemoLimit',
  PROFESSIONAL_ONLY: 'admin.users.lockProfessionalOnly',
  SUBSCRIPTION_REQUIRED: 'admin.users.lockSubscriptionRequired',
  VERIFICATION_REQUIRED: 'admin.users.lockVerificationRequired',
  VERIFICATION_PENDING: 'admin.users.lockVerificationPending',
  ACCOUNT_SUSPENDED: 'admin.users.lockAccountSuspended',
  OFFLINE_UNAVAILABLE: 'admin.users.lockOfflineUnavailable',
  NO_LONGER_AVAILABLE: 'admin.users.lockNoLongerAvailable',
};

/** Catalogue key of each kind of history entry. */
export const ACTIVITY_KIND_LABELS: Record<Schemas['ActivityKind'], MessageKey> = {
  SEARCH: 'admin.users.activitySearch',
  REFERENCE_VIEW: 'admin.users.activityReferenceView',
  CALCULATOR_USE: 'admin.users.activityCalculatorUse',
  PREGNANCY_VIEW: 'admin.users.activityPregnancyView',
};

/** Catalogue key of each kind of favorite. */
export const FAVORITE_TYPE_LABELS: Record<Schemas['FavoriteTargetType'], MessageKey> = {
  REFERENCE_DOCUMENT: 'admin.users.favoriteModels',
  CALCULATOR: 'admin.users.favoriteCalculators',
  SUBSTANCE: 'admin.users.favoriteSubstances',
};

/** Cache key of the user list (invalidated after an action). */
export const usersKey = ['admin', 'users'] as const;

/**
 * A person's name in the ledgers. A deleted account is an anonymous tombstone whose payments are
 * kept (ADR-005): it reads « Compte supprimé ».
 */
export function personName(person: { firstName: string; lastName: string }, t: Translate): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || t('admin.users.deletedAccount');
}
