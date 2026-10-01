import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';

export type EntitlementTier = Schemas['EntitlementTier'];
export type FeatureKey = Schemas['FeatureKey'];
export type LockReason = Schemas['LockReason'];

export const TIER_LABELS: Record<EntitlementTier, MessageKey> = {
  DEMO: 'admin.users.tierDemo',
  STUDENT: 'admin.users.tierStudent',
  PROFESSIONAL_UNPAID: 'admin.users.tierProfessionalUnpaid',
  PROFESSIONAL: 'admin.users.tierProfessional',
  RESTRICTED: 'admin.users.tierRestricted',
};

export const FEATURE_LABELS: Record<FeatureKey, MessageKey> = {
  search: 'admin.users.featureSearch',
  'reference.view': 'admin.users.featureReferenceView',
  'calculator.use': 'admin.users.featureCalculatorUse',
  favorites: 'admin.users.featureFavorites',
  'activity.history': 'admin.users.featureActivityHistory',
  'offline.sync': 'admin.users.featureOfflineSync',
  'subscription.purchase': 'admin.users.featureSubscriptionPurchase',
  'profile.edit': 'admin.users.featureProfileEdit',
};

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

export const ACTIVITY_KIND_LABELS: Record<Schemas['ActivityKind'], MessageKey> = {
  SEARCH: 'admin.users.activitySearch',
  REFERENCE_VIEW: 'admin.users.activityReferenceView',
  CALCULATOR_USE: 'admin.users.activityCalculatorUse',
};

export const FAVORITE_TYPE_LABELS: Record<Schemas['FavoriteTargetType'], MessageKey> = {
  REFERENCE_DOCUMENT: 'admin.users.favoriteModels',
  CALCULATOR: 'admin.users.favoriteCalculators',
};

export const usersKey = ['admin', 'users'] as const;
