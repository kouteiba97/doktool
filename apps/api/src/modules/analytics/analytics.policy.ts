// Analytics vocabulary and privacy rules (design system section 16, audit Appendix B, Lock L42).
import { z } from 'zod';
import type { AnalyticsEventType } from '../../generated/prisma/enums.js';

/** Any aggregate cell behind fewer distinct subjects than this is shown as « < 10 ». */
export const SUPPRESSION_THRESHOLD = 10;
/** Events per upload (the app buffers up to 5 000 offline and sends them in batches). */
export const MAX_BATCH = 100;
/** Offline events older than this are dropped; so are events dated in the future. */
export const MAX_EVENT_AGE_DAYS = 30;
export const MAX_CLOCK_SKEW_MINUTES = 5;
/** Longest period of an analytics dashboard. */
export const MAX_DASHBOARD_DAYS = 400;

const uuid = z.uuid();
const count = z.number().int().min(0).max(100_000);
const version = z.number().int().min(1).max(100_000);
const bandCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const referenceType = z.enum(['ORDONNANCE', 'CERTIFICATE']);
const targetType = z.enum(['REFERENCE_DOCUMENT', 'CALCULATOR']);

/** Screens the demo can open or be stopped at (DEMO_FEATURE_VIEWED `module`). */
export const DEMO_MODULES = [
  'home',
  'search',
  'library',
  'reference',
  'calculator',
  'favorites',
  'offline',
  'subscription',
  'profile',
] as const;

/**
 * Payload of each event the app may send: counts, codes and flags only — never free text, query
 * text, calculator inputs or PDF content. Unknown keys are rejected.
 */
export const CLIENT_EVENTS = {
  SEARCH_PERFORMED: {
    entity: false,
    properties: z.strictObject({
      resultCount: count,
      groups: z.array(targetType).max(2),
    }),
  },
  REFERENCE_SEARCHED: {
    entity: false,
    properties: z.strictObject({ referenceType, resultCount: count }),
  },
  REFERENCE_OPENED: {
    entity: true,
    properties: z.strictObject({ referenceType }),
  },
  REFERENCE_VIEWED: {
    entity: true,
    properties: z.strictObject({ fileVersion: version, source: z.enum(['online', 'offline']) }),
  },
  CALCULATOR_STARTED: {
    entity: true,
    properties: z.strictObject({ version }),
  },
  CALCULATOR_COMPLETED: {
    entity: true,
    properties: z.strictObject({
      version,
      resultBand: bandCode.nullable(),
      engine: z.string().regex(/^(ts|dart)-\d+\.\d+\.\d+$/),
    }),
  },
  /** A pregnancy · lactation profile opened on one of its two blocks (ADR-019). */
  PREGNANCY_VIEWED: {
    entity: true,
    properties: z.strictObject({ section: z.enum(['pregnancy', 'lactation']), version }),
  },
  FAVORITE_ADDED: { entity: true, properties: z.strictObject({ targetType }) },
  FAVORITE_REMOVED: { entity: true, properties: z.strictObject({ targetType }) },
  SUBSCRIPTION_VIEWED: {
    entity: false,
    properties: z.strictObject({ screen: z.enum(['plans', 'subscription', 'review']) }),
  },
  DEMO_STARTED: {
    entity: false,
    demoOnly: true,
    properties: z.strictObject({ demoContext: z.enum(['DOCTOR', 'RESIDENT']) }),
  },
  DEMO_FEATURE_VIEWED: {
    entity: false,
    demoOnly: true,
    properties: z.strictObject({ module: z.enum(DEMO_MODULES), locked: z.boolean() }),
  },
} as const satisfies Partial<
  Record<AnalyticsEventType, { entity: boolean; demoOnly?: boolean; properties: z.ZodType }>
>;

export type ClientEventType = keyof typeof CLIENT_EVENTS;
export const CLIENT_EVENT_TYPES = Object.keys(CLIENT_EVENTS) as ClientEventType[];

export interface ClientEventInput {
  type: ClientEventType;
  occurredAt: Date;
  entityId?: string;
  properties: Record<string, unknown>;
}

export type RejectionReason = 'PROPERTIES' | 'ENTITY' | 'TIME' | 'CONTEXT';

/** Columns an accepted event fills besides the envelope. */
export interface EventColumns {
  entityType: string | null;
  entityId: string | null;
  calculatorVersion: number | null;
  resultBand: string | null;
  properties: Record<string, unknown>;
}

/** Validates one client event; returns its columns or why it is dropped. */
export function checkEvent(
  event: ClientEventInput,
  demo: boolean,
  now: Date,
): { ok: true; columns: EventColumns } | { ok: false; reason: RejectionReason } {
  const rule = CLIENT_EVENTS[event.type];
  const age = now.getTime() - event.occurredAt.getTime();
  if (age > MAX_EVENT_AGE_DAYS * 86_400_000 || age < -MAX_CLOCK_SKEW_MINUTES * 60_000) {
    return { ok: false, reason: 'TIME' };
  }
  if ('demoOnly' in rule && rule.demoOnly && !demo) return { ok: false, reason: 'CONTEXT' };
  if (
    rule.entity !== (event.entityId !== undefined) ||
    (event.entityId !== undefined && !uuid.safeParse(event.entityId).success)
  ) {
    return { ok: false, reason: 'ENTITY' };
  }
  const parsed = rule.properties.safeParse(event.properties);
  if (!parsed.success) return { ok: false, reason: 'PROPERTIES' };
  const properties = parsed.data as Record<string, unknown>;
  const entityType = event.type.startsWith('REFERENCE_')
    ? 'REFERENCE_DOCUMENT'
    : event.type.startsWith('CALCULATOR_')
      ? 'CALCULATOR'
      : event.type === 'PREGNANCY_VIEWED'
        ? 'SUBSTANCE'
        : event.type.startsWith('FAVORITE_')
          ? (properties.targetType as string)
          : null;
  return {
    ok: true,
    columns: {
      entityType,
      entityId: event.entityId ?? null,
      calculatorVersion:
        typeof properties.version === 'number' && event.type.startsWith('CALCULATOR_')
          ? properties.version
          : null,
      resultBand: typeof properties.resultBand === 'string' ? properties.resultBand : null,
      properties,
    },
  };
}

/** A count behind fewer than {@link SUPPRESSION_THRESHOLD} people is not shown. */
export function suppress(value: number, subjects: number): number | null {
  return subjects < SUPPRESSION_THRESHOLD ? null : value;
}
