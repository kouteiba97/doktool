import { z } from 'zod';
import type { Schemas } from '@/api/client';
import { reasonSchema } from '@/ui/reason-dialog';

export type Plan = Schemas['PlanDto'];

/** API bounds of a published plan (PublishPlanDto). */
export const PLAN_LIMITS = {
  minPriceMinor: 5_000,
  maxPriceMinor: 100_000_000,
  maxDurationDays: 3_660,
  maxLines: 20,
  maxLineLength: 200,
} as const;

/** One line per included / excluded item, blank lines ignored. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const lines = z
  .string()
  .refine(
    (text) =>
      linesOf(text).length <= PLAN_LIMITS.maxLines &&
      linesOf(text).every((line) => line.length <= PLAN_LIMITS.maxLineLength),
  );

/** "1 500,50" or "1500.5" DZD → 150050 minor units; null when not a price. */
export function parsePrice(text: string): number | null {
  // `\s` also matches the no-break spaces of French number formatting.
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export const planSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,39}$/),
    nameFr: z.string().trim().min(1).max(80),
    nameEn: z.string().trim().min(1).max(80),
    doctor: z.boolean(),
    resident: z.boolean(),
    price: z.string().refine((value) => {
      const minor = parsePrice(value);
      return (
        minor !== null && minor >= PLAN_LIMITS.minPriceMinor && minor <= PLAN_LIMITS.maxPriceMinor
      );
    }),
    durationDays: z.coerce.number<string>().int().min(1).max(PLAN_LIMITS.maxDurationDays),
    includesFr: lines,
    includesEn: lines,
    excludesFr: lines,
    excludesEn: lines,
    isPurchasable: z.boolean(),
    reason: reasonSchema,
  })
  .refine((values) => values.doctor || values.resident, { path: ['doctor'] });

export type PlanFormInput = z.input<typeof planSchema>;
export type PlanFormOutput = z.output<typeof planSchema>;

/** Form values for a new version of `plan`, or for a new plan code. */
export function planFormValues(plan: Plan | null): PlanFormInput {
  return {
    code: plan?.code ?? '',
    nameFr: plan?.nameFr ?? '',
    nameEn: plan?.nameEn ?? '',
    doctor: plan ? plan.audience.includes('DOCTOR') : true,
    resident: plan ? plan.audience.includes('RESIDENT') : true,
    price: plan ? (plan.priceMinor / 100).toFixed(2) : '',
    durationDays: plan ? String(plan.durationDays) : '',
    includesFr: plan?.includesFr.join('\n') ?? '',
    includesEn: plan?.includesEn.join('\n') ?? '',
    excludesFr: plan?.excludesFr.join('\n') ?? '',
    excludesEn: plan?.excludesEn.join('\n') ?? '',
    isPurchasable: plan?.isPurchasable ?? false,
    reason: '',
  };
}

export function toPublishBody(values: PlanFormOutput): Schemas['PublishPlanDto'] {
  return {
    code: values.code.trim(),
    nameFr: values.nameFr.trim(),
    nameEn: values.nameEn.trim(),
    audience: [
      ...(values.doctor ? ['DOCTOR' as const] : []),
      ...(values.resident ? ['RESIDENT' as const] : []),
    ],
    priceMinor: parsePrice(values.price) ?? 0,
    durationDays: values.durationDays,
    includesFr: linesOf(values.includesFr),
    includesEn: linesOf(values.includesEn),
    excludesFr: linesOf(values.excludesFr),
    excludesEn: linesOf(values.excludesEn),
    isPurchasable: values.isPurchasable,
    reason: values.reason.trim(),
  };
}
