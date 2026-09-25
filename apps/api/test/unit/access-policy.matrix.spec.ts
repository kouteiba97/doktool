// Phase 4 exit criterion: every tier × feature × item tier of the V1 policy (section 27, ADR-006,
// ADR-010). A change to access-policy.config.ts must change a row here.
import { describe, expect, it } from 'vitest';
import { ACCESS_POLICY } from '../../src/modules/access/access-policy.config.js';
import { decideItem, evaluateAccess, featureOf } from '../../src/modules/access/access-policy.js';
import type {
  AccessibleItem,
  AccessInputs,
  FeatureKey,
  LockReason,
  Tier,
  UnlockPath,
} from '../../src/modules/access/access.types.js';
import type { SubscriptionSnapshot } from '../../src/modules/billing/subscription-status.service.js';
import type { VerificationSnapshot } from '../../src/modules/verification/verification-status.service.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const daysAhead = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

type Status = VerificationSnapshot['IDENTITY']['status'];
const kase = (status: Status, submittedDaysAgo: number | null = null) => ({
  status,
  submittedAt: submittedDaysAgo === null ? null : daysAgo(submittedDaysAgo),
  expiresAt: null,
});

interface Person {
  type?: 'DOCTOR' | 'RESIDENT' | 'STUDENT' | null;
  status?: 'ACTIVE' | 'SUSPENDED';
  identity?: ReturnType<typeof kase>;
  professional?: ReturnType<typeof kase>;
  student?: ReturnType<typeof kase>;
  subscription?: SubscriptionSnapshot | null;
}

function person(p: Person): AccessInputs {
  return {
    accessContext: 'AUTHENTICATED',
    account: {
      status: p.status ?? 'ACTIVE',
      professionalType: p.type === undefined ? 'DOCTOR' : p.type,
      academicYear: null,
    },
    verification: {
      IDENTITY: p.identity ?? kase('VERIFIED', 5),
      PROFESSIONAL_STATUS: p.professional ?? kase('NOT_STARTED'),
      STUDENT_STATUS: p.student ?? kase('NOT_STARTED'),
    },
    subscription: p.subscription ?? null,
  };
}

const sub = (
  status: SubscriptionSnapshot['status'],
  periodEnd: Date | null,
  graceEndsAt: Date | null = null,
): SubscriptionSnapshot => ({ status, currentPeriodEnd: periodEnd, graceEndsAt });

const DEMO: AccessInputs = { accessContext: 'DEMO', demoContext: 'DOCTOR' };
const VERIFIED_PRO = kase('VERIFIED', 30);

// ───────────────────────────── tier placement ─────────────────────────────

type Placement = [Tier, (LockReason | null)?, (UnlockPath | null)?];

const PLACEMENTS: [string, AccessInputs, Placement][] = [
  ['demo context', DEMO, ['DEMO']],
  [
    'suspended account',
    person({ status: 'SUSPENDED', professional: VERIFIED_PRO }),
    ['RESTRICTED', 'ACCOUNT_SUSPENDED', null],
  ],
  [
    'no role chosen yet',
    person({ type: null }),
    ['RESTRICTED', 'VERIFICATION_REQUIRED', 'onboarding.role'],
  ],
  [
    'identity rejected',
    person({ identity: kase('REJECTED', 3), professional: VERIFIED_PRO }),
    ['RESTRICTED', 'VERIFICATION_REQUIRED', 'verification.start'],
  ],

  ['student verified', person({ type: 'STUDENT', student: kase('VERIFIED', 40) }), ['STUDENT']],
  [
    'student submitted 3 days ago',
    person({ type: 'STUDENT', student: kase('SUBMITTED', 3) }),
    ['STUDENT'],
  ],
  [
    'student in review 14 days',
    person({ type: 'STUDENT', student: kase('IN_REVIEW', 14) }),
    ['STUDENT'],
  ],
  [
    'student pending 15 days',
    person({ type: 'STUDENT', student: kase('SUBMITTED', 15) }),
    ['RESTRICTED', 'VERIFICATION_PENDING', 'verification.status'],
  ],
  [
    'student not started',
    person({ type: 'STUDENT' }),
    ['RESTRICTED', 'VERIFICATION_REQUIRED', 'verification.start'],
  ],
  [
    'student expired',
    person({ type: 'STUDENT', student: kase('EXPIRED', 400) }),
    ['RESTRICTED', 'VERIFICATION_REQUIRED', 'verification.start'],
  ],
  [
    'student rejected',
    person({ type: 'STUDENT', student: kase('REJECTED', 5) }),
    ['RESTRICTED', 'VERIFICATION_REQUIRED', 'verification.start'],
  ],

  ['doctor not verified, no plan', person({}), ['PROFESSIONAL_UNPAID']],
  ['doctor verified, no plan', person({ professional: VERIFIED_PRO }), ['PROFESSIONAL_UNPAID']],
  [
    'doctor verified, ACTIVE',
    person({ professional: VERIFIED_PRO, subscription: sub('ACTIVE', daysAhead(20)) }),
    ['PROFESSIONAL'],
  ],
  [
    'doctor verified, ACTIVE 3 days past end (grace fallback)',
    person({ professional: VERIFIED_PRO, subscription: sub('ACTIVE', daysAgo(3)) }),
    ['PROFESSIONAL'],
  ],
  [
    'doctor verified, ACTIVE 8 days past end',
    person({ professional: VERIFIED_PRO, subscription: sub('ACTIVE', daysAgo(8)) }),
    ['PROFESSIONAL_UNPAID'],
  ],
  [
    'doctor verified, GRACE',
    person({ professional: VERIFIED_PRO, subscription: sub('GRACE', daysAgo(2), daysAhead(5)) }),
    ['PROFESSIONAL'],
  ],
  [
    'doctor verified, GRACE ended',
    person({ professional: VERIFIED_PRO, subscription: sub('GRACE', daysAgo(9), daysAgo(2)) }),
    ['PROFESSIONAL_UNPAID'],
  ],
  [
    'doctor verified, CANCELED before end',
    person({ professional: VERIFIED_PRO, subscription: sub('CANCELED', daysAhead(10)) }),
    ['PROFESSIONAL'],
  ],
  [
    'doctor verified, CANCELED after end',
    person({ professional: VERIFIED_PRO, subscription: sub('CANCELED', daysAgo(1)) }),
    ['PROFESSIONAL_UNPAID'],
  ],
  [
    'doctor verified, EXPIRED',
    person({ professional: VERIFIED_PRO, subscription: sub('EXPIRED', daysAgo(30)) }),
    ['PROFESSIONAL_UNPAID'],
  ],
  [
    'doctor verified, PENDING_PAYMENT',
    person({ professional: VERIFIED_PRO, subscription: sub('PENDING_PAYMENT', null) }),
    ['PROFESSIONAL_UNPAID'],
  ],
  [
    'verification expired during a live plan',
    person({ professional: kase('EXPIRED', 400), subscription: sub('ACTIVE', daysAhead(10)) }),
    ['PROFESSIONAL'],
  ],
  [
    'verification rejected during a live plan',
    person({ professional: kase('REJECTED', 2), subscription: sub('ACTIVE', daysAhead(10)) }),
    ['RESTRICTED', 'VERIFICATION_REQUIRED', 'verification.start'],
  ],
  [
    'resident verified, ACTIVE',
    person({
      type: 'RESIDENT',
      professional: VERIFIED_PRO,
      subscription: sub('ACTIVE', daysAhead(20)),
    }),
    ['PROFESSIONAL'],
  ],
  [
    'resident submitted',
    person({ type: 'RESIDENT', professional: kase('SUBMITTED', 1) }),
    ['PROFESSIONAL_UNPAID'],
  ],
];

describe('tier placement', () => {
  it.each(PLACEMENTS)('%s', (_, inputs, [tier, reason, path]) => {
    const profile = evaluateAccess(inputs, NOW);
    expect(profile.tier).toBe(tier);
    if (tier === 'RESTRICTED') {
      expect(profile.content.calculators).toEqual({
        scope: 'NONE',
        lockReason: reason,
        unlockPath: path,
      });
      expect(profile.content.referenceDocuments).toEqual({
        scope: 'NONE',
        lockReason: reason,
        unlockPath: path,
      });
    }
  });
});

// ───────────────────────────── tier × feature ─────────────────────────────

const REPRESENTATIVE: Record<Tier, AccessInputs> = {
  DEMO,
  STUDENT: person({ type: 'STUDENT', student: kase('VERIFIED', 40) }),
  PROFESSIONAL_UNPAID: person({ professional: VERIFIED_PRO }),
  PROFESSIONAL: person({ professional: VERIFIED_PRO, subscription: sub('ACTIVE', daysAhead(20)) }),
  RESTRICTED: person({ type: 'STUDENT' }),
};

const A = ['AVAILABLE', null, null, false] as const;
const RO = ['AVAILABLE', null, null, true] as const;
const L = (reason: LockReason, path: UnlockPath | null) => ['LOCKED', reason, path, false] as const;
const RESTRICTED_LOCK = L('VERIFICATION_REQUIRED', 'verification.start');

const FEATURES: Record<
  Tier,
  Record<FeatureKey, readonly [string, LockReason | null, UnlockPath | null, boolean]>
> = {
  DEMO: {
    search: A,
    'reference.view': A,
    'calculator.use': A,
    favorites: A,
    'activity.history': A,
    'offline.sync': L('DEMO_LIMIT', 'auth.sign-up'),
    'subscription.purchase': L('DEMO_LIMIT', 'auth.sign-up'),
    'profile.edit': L('DEMO_LIMIT', 'auth.sign-up'),
  },
  STUDENT: {
    search: A,
    'reference.view': A,
    'calculator.use': A,
    favorites: A,
    'activity.history': A,
    'offline.sync': A,
    'subscription.purchase': L('PROFESSIONAL_ONLY', null),
    'profile.edit': A,
  },
  PROFESSIONAL_UNPAID: {
    search: A,
    'reference.view': A,
    'calculator.use': A,
    favorites: A,
    'activity.history': A,
    'offline.sync': L('SUBSCRIPTION_REQUIRED', 'subscription.plans'),
    'subscription.purchase': A,
    'profile.edit': A,
  },
  PROFESSIONAL: {
    search: A,
    'reference.view': A,
    'calculator.use': A,
    favorites: A,
    'activity.history': A,
    'offline.sync': A,
    'subscription.purchase': A,
    'profile.edit': A,
  },
  RESTRICTED: {
    search: A,
    'reference.view': RESTRICTED_LOCK,
    'calculator.use': RESTRICTED_LOCK,
    favorites: RO,
    'activity.history': RO,
    'offline.sync': RESTRICTED_LOCK,
    'subscription.purchase': RESTRICTED_LOCK,
    'profile.edit': A,
  },
};

describe('tier × feature', () => {
  const rows = Object.entries(FEATURES).flatMap(([tier, features]) =>
    Object.entries(features).map(
      ([key, expected]) => [tier as Tier, key as FeatureKey, expected] as const,
    ),
  );

  it('covers all 5 tiers × 8 features', () => {
    expect(rows).toHaveLength(40);
  });

  it.each(rows)('%s · %s', (tier, key, [state, lockReason, unlockPath, readOnly]) => {
    const profile = evaluateAccess(REPRESENTATIVE[tier], NOW);
    expect(profile.tier).toBe(tier);
    expect(featureOf(profile, key)).toEqual({ key, state, lockReason, unlockPath, readOnly });
  });

  it('opens purchase for unpaid professionals only once professionally verified (Q6)', () => {
    const purchase = (inputs: AccessInputs) =>
      featureOf(evaluateAccess(inputs, NOW), 'subscription.purchase');
    expect(purchase(person({}))).toMatchObject({
      state: 'LOCKED',
      lockReason: 'VERIFICATION_REQUIRED',
      unlockPath: 'verification.start',
    });
    expect(purchase(person({ professional: kase('IN_REVIEW', 1) }))).toMatchObject({
      state: 'LOCKED',
      lockReason: 'VERIFICATION_PENDING',
      unlockPath: 'verification.status',
    });
    expect(purchase(person({ professional: kase('EXPIRED', 400) }))).toMatchObject({
      state: 'LOCKED',
      lockReason: 'VERIFICATION_REQUIRED',
    });
    expect(purchase(person({ professional: VERIFIED_PRO }))).toMatchObject({ state: 'AVAILABLE' });
  });
});

// ───────────────────────────── tier × item ─────────────────────────────

const ITEMS: Record<string, AccessibleItem> = {
  'calculator (student tier)': { type: 'calculators', accessTier: 'STUDENT', demoSample: false },
  'calculator (professional tier)': {
    type: 'calculators',
    accessTier: 'PROFESSIONAL',
    demoSample: false,
  },
  'calculator (professional tier, demo sample)': {
    type: 'calculators',
    accessTier: 'PROFESSIONAL',
    demoSample: true,
  },
  'reference document': { type: 'referenceDocuments', demoSample: false },
  'reference document (demo sample)': { type: 'referenceDocuments', demoSample: true },
};

type Outcome = 'OPEN' | readonly [LockReason, UnlockPath | null];
const DEMO_LOCK = ['DEMO_LIMIT', 'subscription.plans'] as const;
const PRO_ONLY = ['PROFESSIONAL_ONLY', null] as const;
const PAY = ['SUBSCRIPTION_REQUIRED', 'subscription.plans'] as const;
const VERIFY = ['VERIFICATION_REQUIRED', 'verification.start'] as const;

const ITEM_MATRIX: Record<Tier, Record<keyof typeof ITEMS, Outcome>> = {
  DEMO: {
    'calculator (student tier)': DEMO_LOCK,
    'calculator (professional tier)': DEMO_LOCK,
    'calculator (professional tier, demo sample)': 'OPEN',
    'reference document': DEMO_LOCK,
    'reference document (demo sample)': 'OPEN',
  },
  STUDENT: {
    'calculator (student tier)': 'OPEN',
    'calculator (professional tier)': PRO_ONLY,
    'calculator (professional tier, demo sample)': 'OPEN',
    'reference document': PRO_ONLY,
    'reference document (demo sample)': 'OPEN',
  },
  PROFESSIONAL_UNPAID: {
    'calculator (student tier)': PAY,
    'calculator (professional tier)': PAY,
    'calculator (professional tier, demo sample)': 'OPEN',
    'reference document': PAY,
    'reference document (demo sample)': 'OPEN',
  },
  PROFESSIONAL: {
    'calculator (student tier)': 'OPEN',
    'calculator (professional tier)': 'OPEN',
    'calculator (professional tier, demo sample)': 'OPEN',
    'reference document': 'OPEN',
    'reference document (demo sample)': 'OPEN',
  },
  RESTRICTED: {
    'calculator (student tier)': VERIFY,
    'calculator (professional tier)': VERIFY,
    'calculator (professional tier, demo sample)': VERIFY,
    'reference document': VERIFY,
    'reference document (demo sample)': VERIFY,
  },
};

describe('tier × item', () => {
  const rows = Object.entries(ITEM_MATRIX).flatMap(([tier, items]) =>
    Object.entries(items).map(([item, outcome]) => [tier as Tier, item, outcome] as const),
  );

  it('covers all 5 tiers × 5 item kinds', () => {
    expect(rows).toHaveLength(25);
  });

  it.each(rows)('%s · %s', (tier, itemName, outcome) => {
    const decision = decideItem(evaluateAccess(REPRESENTATIVE[tier], NOW), ITEMS[itemName]!);
    expect(decision).toEqual(
      outcome === 'OPEN'
        ? { state: 'AVAILABLE', lockReason: null, unlockPath: null }
        : { state: 'LOCKED', lockReason: outcome[0], unlockPath: outcome[1] },
    );
  });
});

describe('profile envelope', () => {
  it('carries the policy version and every feature exactly once', () => {
    const profile = evaluateAccess(REPRESENTATIVE.PROFESSIONAL, NOW);
    expect(profile.policyVersion).toBe(ACCESS_POLICY.version);
    expect(profile.computedAt).toEqual(NOW);
    expect(new Set(profile.features.map((f) => f.key)).size).toBe(8);
  });
});
