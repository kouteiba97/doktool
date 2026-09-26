// Finance rules (design system section 15, ADR-005, ADR-017).
import type { PaymentProvider } from '../../generated/prisma/enums.js';
import type { RevenueRow } from '../billing/index.js';

export const CURRENCY = 'DZD';

/** Reason codes of an exceptional adjustment (section 15: law, accounting, provider error). */
export const ADJUSTMENT_REASONS = [
  'PROVIDER_ERROR',
  'DUPLICATE_PAYMENT',
  'LEGAL_OBLIGATION',
  'ACCOUNTING_CORRECTION',
  'OTHER',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/** Longest period one overview or report covers. */
export const MAX_PERIOD_DAYS = 400;

export type Bucket = 'DAY' | 'WEEK' | 'MONTH';

export interface FeeRate {
  rateBps: number;
  fixedMinor: number;
}

export interface Period {
  from: Date;
  to: Date;
}

const DAY_MS = 86_400_000;

/** The equal period just before (comparison of section 15). */
export function previousPeriod({ from, to }: Period): Period {
  const length = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - length), to: new Date(from) };
}

/** Days for ≤ 45 days, ISO weeks for ≤ 6 months, months beyond. */
export function bucketFor({ from, to }: Period): Bucket {
  const days = (to.getTime() - from.getTime()) / DAY_MS;
  return days <= 45 ? 'DAY' : days <= 186 ? 'WEEK' : 'MONTH';
}

/** Start (UTC) of the bucket holding `date`. */
export function bucketStart(date: Date, bucket: Bucket): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (bucket === 'DAY') return day;
  if (bucket === 'MONTH') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - weekday * DAY_MS);
}

export function nextBucket(start: Date, bucket: Bucket): Date {
  if (bucket === 'DAY') return new Date(start.getTime() + DAY_MS);
  if (bucket === 'WEEK') return new Date(start.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/** Every bucket start overlapping the period. */
export function bucketStarts(period: Period, bucket: Bucket): Date[] {
  const starts: Date[] = [];
  for (
    let start = bucketStart(period.from, bucket);
    start < period.to;
    start = nextBucket(start, bucket)
  ) {
    starts.push(start);
  }
  return starts;
}

/** Estimated provider fee of one payment: rate + fixed part, never above the amount. */
export function estimateFee(amountMinor: number, rate: FeeRate): number {
  return Math.min(amountMinor, Math.round((amountMinor * rate.rateBps) / 10_000) + rate.fixedMinor);
}

export interface FeeView {
  feesMinor: number;
  /** True while the provider has not settled the actual fee. */
  estimated: boolean;
  /** No rate is configured for the provider: the estimate is 0 and must be shown as unknown. */
  rateMissing: boolean;
}

export function feeOf(
  row: Pick<RevenueRow, 'amountMinor' | 'paymentFeesMinor' | 'paymentProvider'>,
  rates: ReadonlyMap<PaymentProvider, FeeRate>,
): FeeView {
  if (row.paymentFeesMinor !== null) {
    return { feesMinor: row.paymentFeesMinor, estimated: false, rateMissing: false };
  }
  const rate = rates.get(row.paymentProvider);
  return rate
    ? { feesMinor: estimateFee(row.amountMinor, rate), estimated: true, rateMissing: false }
    : { feesMinor: 0, estimated: true, rateMissing: true };
}

export interface Ledger {
  /** Payments plus approved exceptional adjustments. */
  grossMinor: number;
  /** Sum of the approved exceptional adjustments (negative for reversals). */
  adjustmentsMinor: number;
  feesMinor: number;
  /** Part of the fees that is still an estimate. */
  estimatedFeesMinor: number;
  netRevenueMinor: number;
  expensesMinor: number;
  netProfitMinor: number;
  payments: number;
}

/** Gross → fees → net revenue; net revenue → expenses → net profit (Lock L40). */
export function ledgerOf(input: {
  revenue: readonly Pick<RevenueRow, 'amountMinor' | 'paymentFeesMinor' | 'paymentProvider'>[];
  rates: ReadonlyMap<PaymentProvider, FeeRate>;
  adjustments: readonly { amountMinor: number }[];
  expenses: readonly { amountMinor: number }[];
}): Ledger {
  let payments = 0;
  let fees = 0;
  let estimated = 0;
  for (const row of input.revenue) {
    payments += row.amountMinor;
    const fee = feeOf(row, input.rates);
    fees += fee.feesMinor;
    if (fee.estimated) estimated += fee.feesMinor;
  }
  const adjustments = input.adjustments.reduce((total, row) => total + row.amountMinor, 0);
  const expenses = input.expenses.reduce((total, row) => total + row.amountMinor, 0);
  const gross = payments + adjustments;
  const net = gross - fees;
  return {
    grossMinor: gross,
    adjustmentsMinor: adjustments,
    feesMinor: fees,
    estimatedFeesMinor: estimated,
    netRevenueMinor: net,
    expensesMinor: expenses,
    netProfitMinor: net - expenses,
    payments: input.revenue.length,
  };
}

/** One CSV cell: quoted when it holds a separator, a quote or a line break. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV with `;` separators (Excel in French locales) and a UTF-8 BOM; definitions first. */
export function csvDocument(
  definitions: readonly string[],
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const lines = [
    ...definitions.map((line) => csvCell(`# ${line}`)),
    '',
    header.map(csvCell).join(';'),
    ...rows.map((row) => row.map(csvCell).join(';')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Minor units as a plain decimal for spreadsheets: 150050 → "1500.50". */
export function decimal(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const value = Math.abs(minor);
  return `${sign}${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
