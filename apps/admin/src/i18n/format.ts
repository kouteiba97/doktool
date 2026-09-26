import type { Locale } from './messages';

// Numbers, dates and units follow the UI language (design system section 19).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function formatDate(locale: Locale, value: string | Date): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(locale: Locale, value: string | Date): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function formatNumber(locale: Locale, value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

/** Minor units (centimes) → "1 500,00 DZD" / "DZD 1,500.00". */
export function formatMoney(locale: Locale, minor: number, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

export function formatBytes(locale: Locale, bytes: number): string {
  const [value, unit] =
    bytes >= 1_000_000
      ? [bytes / 1_000_000, 'megabyte']
      : bytes >= 1_000
        ? [bytes / 1_000, 'kilobyte']
        : [bytes, 'byte'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Time elapsed since `from`, in the largest whole unit: "45 min", "6 h", "3 j". */
export function formatAge(locale: Locale, from: string | Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(from).getTime());
  const [value, unit] =
    elapsed < HOUR
      ? [Math.floor(elapsed / 60_000), 'minute']
      : elapsed < 2 * DAY
        ? [Math.floor(elapsed / HOUR), 'hour']
        : [Math.floor(elapsed / DAY), 'day'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
}

export function hoursSince(from: string | Date, now: Date = new Date()): number {
  return (now.getTime() - new Date(from).getTime()) / HOUR;
}
