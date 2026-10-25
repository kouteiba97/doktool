import type { DemoContext, EntitlementTier } from '../../generated/prisma/enums.js';
import type { SubscriptionSnapshot } from '../billing/index.js';
import type { AccessFacts } from '../users/index.js';
import type { VerificationSnapshot } from '../verification/index.js';

/** V1 feature keys (section 27). */
export const FEATURE_KEYS = [
  'search',
  'reference.view',
  'calculator.use',
  'pregnancy.view',
  'favorites',
  'activity.history',
  'offline.sync',
  'subscription.purchase',
  'profile.edit',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Section 27 lock reasons, plus ACCOUNT_SUSPENDED ("or suspension notice", ADR-010). */
export const LOCK_REASONS = [
  'DEMO_LIMIT',
  'PROFESSIONAL_ONLY',
  'SUBSCRIPTION_REQUIRED',
  'VERIFICATION_REQUIRED',
  'VERIFICATION_PENDING',
  'ACCOUNT_SUSPENDED',
  'OFFLINE_UNAVAILABLE',
  'NO_LONGER_AVAILABLE',
] as const;
export type LockReason = (typeof LOCK_REASONS)[number];

/** Where the app sends the person to lift a lock; null = explanation only. */
export const UNLOCK_PATHS = [
  'auth.sign-up',
  'subscription.plans',
  'onboarding.role',
  'verification.start',
  'verification.status',
] as const;
export type UnlockPath = (typeof UNLOCK_PATHS)[number];

/** The five tiers, as stored in the database enum. */
export type Tier = EntitlementTier;

/** The decision about one feature. */
export interface FeatureDecision {
  key: FeatureKey;
  state: 'AVAILABLE' | 'LOCKED';
  lockReason: LockReason | null;
  unlockPath: UnlockPath | null;
  /** Available for reading only (RESTRICTED favorites and history). */
  readOnly: boolean;
}

/** Which items of a content type open: all, student-tier (+ demo samples), demo samples, none. */
export type ContentScope = 'ALL' | 'STUDENT_TIER' | 'DEMO_SAMPLE' | 'NONE';

/** Content rule of one content type. */
export interface ContentRule {
  scope: ContentScope;
  /** Reason shown on items outside the scope. */
  lockReason: LockReason;
  unlockPath: UnlockPath | null;
}

export type ContentType = 'calculators' | 'referenceDocuments' | 'pregnancyProfiles';

/** Everything the app needs to show or lock: computed by evaluateAccess, never stored. */
export interface AccessProfile {
  accessContext: 'AUTHENTICATED' | 'DEMO';
  tier: Tier;
  features: FeatureDecision[];
  content: Record<ContentType, ContentRule>;
  computedAt: Date;
  policyVersion: string;
}

/** Everything the policy needs, gathered from users, verification and billing. */
export type AccessInputs =
  | { accessContext: 'DEMO'; demoContext: DemoContext }
  | {
      accessContext: 'AUTHENTICATED';
      account: AccessFacts;
      verification: VerificationSnapshot;
      subscription: SubscriptionSnapshot | null;
    };

/** The access facts of one item, as stored by its content module. */
export interface AccessibleItem {
  type: ContentType;
  /** Calculators only; reference documents have no per-item tier (ADR-006 D3). */
  accessTier?: 'STUDENT' | 'PROFESSIONAL';
  demoSample: boolean;
}

/** The decision about one item (a calculator, a reference model, a pregnancy profile). */
export interface ItemAccess {
  state: 'AVAILABLE' | 'LOCKED';
  lockReason: LockReason | null;
  unlockPath: UnlockPath | null;
}
