// Pure evaluation of the entitlement policy: inputs + policy + time → AccessProfile.
// No I/O, so the whole policy is covered by one matrix test.
import type { CaseSnapshot } from '../verification/index.js';
import type { SubscriptionSnapshot } from '../billing/index.js';
import { ACCESS_POLICY, type AccessPolicy, type FeatureSetting } from './access-policy.config.js';
import {
  type AccessibleItem,
  type AccessInputs,
  type AccessProfile,
  type ContentRule,
  type ContentType,
  FEATURE_KEYS,
  type FeatureDecision,
  type ItemAccess,
  type LockReason,
  type Tier,
  type UnlockPath,
} from './access.types.js';

const DAY_MS = 24 * 3600 * 1000;
const PENDING = new Set(['SUBMITTED', 'IN_REVIEW', 'APPEALED']);

/** Why an account is RESTRICTED: shown on every locked item and feature. */
interface Restriction {
  lockReason: LockReason;
  unlockPath: UnlockPath | null;
}

/** The tier a person lands in, why they are restricted (if so) and whether they may buy. */
interface Placement {
  tier: Tier;
  restriction: Restriction | null;
  /** PROFESSIONAL_UNPAID only: 'OPEN' once professionally verified (Q6), else why it is locked. */
  purchase: Restriction | 'OPEN' | null;
}

/** Shortcut for a RESTRICTED placement with its reason and unlock path. */
const restricted = (lockReason: LockReason, unlockPath: UnlockPath | null): Placement => ({
  tier: 'RESTRICTED',
  restriction: { lockReason, unlockPath },
  purchase: null,
});

/**
 * True while a subscription gives Pro access: ACTIVE (with a grace fallback), CANCELED until the
 * end of the paid period, GRACE until its end date.
 */
export function isSubscriptionLive(
  subscription: SubscriptionSnapshot | null,
  now: Date,
  policy: AccessPolicy = ACCESS_POLICY,
): boolean {
  if (!subscription) return false;
  const time = now.getTime();
  const periodEnd = subscription.currentPeriodEnd?.getTime() ?? Number.NEGATIVE_INFINITY;
  switch (subscription.status) {
    case 'ACTIVE':
      return time < periodEnd + policy.subscriptionGraceFallbackDays * DAY_MS;
    case 'CANCELED':
      return time < periodEnd;
    case 'GRACE':
      return time < (subscription.graceEndsAt?.getTime() ?? Number.NEGATIVE_INFINITY);
    default:
      return false;
  }
}

/** True when a verification case is waiting for review and was submitted less than `days` ago. */
function isPendingWithin(snapshot: CaseSnapshot, days: number, now: Date): boolean {
  return (
    PENDING.has(snapshot.status) &&
    snapshot.submittedAt !== null &&
    now.getTime() - snapshot.submittedAt.getTime() <= days * DAY_MS
  );
}

/** Places a person in exactly one tier (section 27 table, ADR-010 §3–4). */
export function placeInTier(inputs: AccessInputs, now: Date, policy: AccessPolicy): Placement {
  if (inputs.accessContext === 'DEMO') return { tier: 'DEMO', restriction: null, purchase: null };

  const { account, verification, subscription } = inputs;
  if (account.status !== 'ACTIVE') return restricted('ACCOUNT_SUSPENDED', null);
  if (account.professionalType === null)
    return restricted('VERIFICATION_REQUIRED', 'onboarding.role');
  if (verification.IDENTITY.status === 'REJECTED') {
    return restricted('VERIFICATION_REQUIRED', 'verification.start');
  }

  if (account.professionalType === 'STUDENT') {
    const student = verification.STUDENT_STATUS;
    if (student.status === 'VERIFIED')
      return { tier: 'STUDENT', restriction: null, purchase: null };
    if (isPendingWithin(student, policy.studentPendingWindowDays, now)) {
      return { tier: 'STUDENT', restriction: null, purchase: null };
    }
    return PENDING.has(student.status)
      ? restricted('VERIFICATION_PENDING', 'verification.status')
      : restricted('VERIFICATION_REQUIRED', 'verification.start');
  }

  const professional = verification.PROFESSIONAL_STATUS;
  if (professional.status === 'REJECTED')
    return restricted('VERIFICATION_REQUIRED', 'verification.start');
  const verifiedOrLapsed = professional.status === 'VERIFIED' || professional.status === 'EXPIRED';
  if (verifiedOrLapsed && isSubscriptionLive(subscription, now, policy)) {
    return { tier: 'PROFESSIONAL', restriction: null, purchase: null };
  }
  const purchase: Placement['purchase'] =
    professional.status === 'VERIFIED'
      ? 'OPEN'
      : PENDING.has(professional.status) || professional.renewalPending
        ? { lockReason: 'VERIFICATION_PENDING', unlockPath: 'verification.status' }
        : { lockReason: 'VERIFICATION_REQUIRED', unlockPath: 'verification.start' };
  return { tier: 'PROFESSIONAL_UNPAID', restriction: null, purchase };
}

/**
 * Turns one feature setting of the tier into the decision sent to the app (available, locked,
 * read-only).
 */
function decideFeature(
  key: FeatureDecision['key'],
  setting: FeatureSetting,
  placement: Placement,
): FeatureDecision {
  // Builds the decision object for this feature.
  const decision = (
    state: FeatureDecision['state'],
    lockReason: LockReason | null = null,
    unlockPath: UnlockPath | null = null,
    readOnly = false,
  ): FeatureDecision => ({ key, state, lockReason, unlockPath, readOnly });

  switch (setting.state) {
    case 'AVAILABLE':
      return decision('AVAILABLE', null, null, setting.readOnly ?? false);
    case 'LOCKED':
      return decision('LOCKED', setting.lockReason, setting.unlockPath);
    case 'RESTRICTION': {
      const restriction = placement.restriction ?? {
        lockReason: 'VERIFICATION_REQUIRED',
        unlockPath: 'verification.start',
      };
      return decision('LOCKED', restriction.lockReason, restriction.unlockPath);
    }
    case 'PURCHASE_AFTER_VERIFICATION':
      return placement.purchase === 'OPEN' || placement.purchase === null
        ? decision('AVAILABLE')
        : decision('LOCKED', placement.purchase.lockReason, placement.purchase.unlockPath);
  }
}

/**
 * Computes the full AccessProfile: tier, every feature decision and every content rule. Pure: same
 * inputs and time give the same profile.
 */
export function evaluateAccess(
  inputs: AccessInputs,
  now: Date = new Date(),
  policy: AccessPolicy = ACCESS_POLICY,
): AccessProfile {
  const placement = placeInTier(inputs, now, policy);
  const tier = policy.tiers[placement.tier];
  // The content rule of one type; RESTRICTED takes the reason of its restriction.
  const contentRule = (type: ContentType): ContentRule => {
    const rule = tier.content[type];
    if ('fromRestriction' in rule) {
      return {
        scope: 'NONE',
        lockReason: placement.restriction?.lockReason ?? 'VERIFICATION_REQUIRED',
        unlockPath: placement.restriction?.unlockPath ?? null,
      };
    }
    return rule;
  };
  return {
    accessContext: inputs.accessContext,
    tier: placement.tier,
    features: FEATURE_KEYS.map((key) => decideFeature(key, tier.features[key], placement)),
    content: {
      calculators: contentRule('calculators'),
      referenceDocuments: contentRule('referenceDocuments'),
      pregnancyProfiles: contentRule('pregnancyProfiles'),
    },
    computedAt: now,
    policyVersion: policy.version,
  };
}

/** Opens or locks one item for a profile. "Not available" (disabled) is the content module's call. */
export function decideItem(profile: AccessProfile, item: AccessibleItem): ItemAccess {
  const rule = profile.content[item.type];
  const opens =
    rule.scope === 'ALL' ||
    (rule.scope === 'STUDENT_TIER' && (item.accessTier === 'STUDENT' || item.demoSample)) ||
    (rule.scope === 'DEMO_SAMPLE' && item.demoSample);
  return opens
    ? { state: 'AVAILABLE', lockReason: null, unlockPath: null }
    : { state: 'LOCKED', lockReason: rule.lockReason, unlockPath: rule.unlockPath };
}

/** Returns one feature decision of a profile; a missing key is a programming error. */
export function featureOf(profile: AccessProfile, key: FeatureDecision['key']): FeatureDecision {
  const feature = profile.features.find((candidate) => candidate.key === key);
  if (!feature) throw new Error(`Feature ${key} missing from the profile`);
  return feature;
}
