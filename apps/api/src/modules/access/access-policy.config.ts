// The V1 entitlement policy as data (section 27 + ADR-006 + ADR-010).
// Change a value here, bump `version`, and update test/unit/access-policy.matrix.spec.ts.
import type {
  ContentRule,
  ContentType,
  FeatureKey,
  LockReason,
  Tier,
  UnlockPath,
} from './access.types.js';

/** A feature state in the config: available, available read-only, locked, or decided at runtime. */
export type FeatureSetting =
  | { state: 'AVAILABLE'; readOnly?: boolean }
  | { state: 'LOCKED'; lockReason: LockReason; unlockPath: UnlockPath | null }
  /** Locked with the reason that restricted the account (RESTRICTED tier only). */
  | { state: 'RESTRICTION' }
  /** Purchase for PROFESSIONAL_UNPAID: open once professional verification is VERIFIED (Q6). */
  | { state: 'PURCHASE_AFTER_VERIFICATION' };

export interface TierSetting {
  content: Record<ContentType, ContentRule | { scope: 'NONE'; fromRestriction: true }>;
  features: Record<FeatureKey, FeatureSetting>;
}

const available: FeatureSetting = { state: 'AVAILABLE' };
const locked = (lockReason: LockReason, unlockPath: UnlockPath | null): FeatureSetting => ({
  state: 'LOCKED',
  lockReason,
  unlockPath,
});
const demoSamplesOnly = (lockReason: LockReason, unlockPath: UnlockPath | null): ContentRule => ({
  scope: 'DEMO_SAMPLE',
  lockReason,
  unlockPath,
});
const everything: ContentRule = {
  scope: 'ALL',
  lockReason: 'SUBSCRIPTION_REQUIRED',
  unlockPath: null,
};

export const ACCESS_POLICY = {
  version: '2026-10-04.1',
  /** A student whose status case is submitted keeps student access this long (section 27). */
  studentPendingWindowDays: 14,
  /** ACTIVE past its period end still counts as live this long, if billing has not moved it to GRACE yet. */
  subscriptionGraceFallbackDays: 7,

  tiers: {
    DEMO: {
      content: {
        calculators: demoSamplesOnly('DEMO_LIMIT', 'subscription.plans'),
        referenceDocuments: demoSamplesOnly('DEMO_LIMIT', 'subscription.plans'),
        pregnancyProfiles: demoSamplesOnly('DEMO_LIMIT', 'subscription.plans'),
      },
      features: {
        search: available,
        'reference.view': available,
        'pregnancy.view': available,
        'calculator.use': available,
        // Kept on the device only; discarded with the demo (section 27).
        favorites: available,
        'activity.history': available,
        'offline.sync': locked('DEMO_LIMIT', 'auth.sign-up'),
        'subscription.purchase': locked('DEMO_LIMIT', 'auth.sign-up'),
        'profile.edit': locked('DEMO_LIMIT', 'auth.sign-up'),
      },
    },
    STUDENT: {
      content: {
        // ADR-006 Q2: the clinical calculators; every V1 calculator is student-tier.
        calculators: { scope: 'STUDENT_TIER', lockReason: 'PROFESSIONAL_ONLY', unlockPath: null },
        // ADR-006 Q2 + D2: titles only, except the demo samples.
        referenceDocuments: demoSamplesOnly('PROFESSIONAL_ONLY', null),
        // ADR-019: like the reference models, names only except the demo samples.
        pregnancyProfiles: demoSamplesOnly('PROFESSIONAL_ONLY', null),
      },
      features: {
        search: available,
        'reference.view': available,
        'pregnancy.view': available,
        'calculator.use': available,
        favorites: available,
        'activity.history': available,
        'offline.sync': available,
        // Students are not a paying audience: explanation only, no upsell.
        'subscription.purchase': locked('PROFESSIONAL_ONLY', null),
        'profile.edit': available,
      },
    },
    PROFESSIONAL_UNPAID: {
      content: {
        // ADR-006 Q1: the demo sample set, with a real account.
        calculators: demoSamplesOnly('SUBSCRIPTION_REQUIRED', 'subscription.plans'),
        referenceDocuments: demoSamplesOnly('SUBSCRIPTION_REQUIRED', 'subscription.plans'),
        pregnancyProfiles: demoSamplesOnly('SUBSCRIPTION_REQUIRED', 'subscription.plans'),
      },
      features: {
        search: available,
        'reference.view': available,
        'pregnancy.view': available,
        'calculator.use': available,
        favorites: available,
        'activity.history': available,
        'offline.sync': locked('SUBSCRIPTION_REQUIRED', 'subscription.plans'),
        'subscription.purchase': { state: 'PURCHASE_AFTER_VERIFICATION' },
        'profile.edit': available,
      },
    },
    PROFESSIONAL: {
      content: {
        calculators: everything,
        referenceDocuments: everything,
        pregnancyProfiles: everything,
      },
      features: {
        search: available,
        'reference.view': available,
        'pregnancy.view': available,
        'calculator.use': available,
        favorites: available,
        'activity.history': available,
        'offline.sync': available,
        // Renewal.
        'subscription.purchase': available,
        'profile.edit': available,
      },
    },
    RESTRICTED: {
      content: {
        calculators: { scope: 'NONE', fromRestriction: true },
        referenceDocuments: { scope: 'NONE', fromRestriction: true },
        pregnancyProfiles: { scope: 'NONE', fromRestriction: true },
      },
      features: {
        search: available,
        'reference.view': { state: 'RESTRICTION' },
        'pregnancy.view': { state: 'RESTRICTION' },
        'calculator.use': { state: 'RESTRICTION' },
        favorites: { state: 'AVAILABLE', readOnly: true },
        'activity.history': { state: 'AVAILABLE', readOnly: true },
        'offline.sync': { state: 'RESTRICTION' },
        'subscription.purchase': { state: 'RESTRICTION' },
        'profile.edit': available,
      },
    },
  } satisfies Record<Tier, TierSetting>,
} as const;

export type AccessPolicy = typeof ACCESS_POLICY;
