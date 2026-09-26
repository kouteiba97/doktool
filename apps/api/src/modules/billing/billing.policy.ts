// Subscription rules of V1 (section 06, ADR-005, ADR-015).

/** Renewal opens this many days before the period ends (« Renouveler »). */
export const RENEWAL_WINDOW_DAYS = 14;
/** Access is kept this many days after the end, with a neutral notice. */
export const GRACE_DAYS = 7;
/** Reminders before the end of a period (notifications, never banners). */
export const RENEWAL_REMINDER_DAYS = [14, 3] as const;
/** A checkout left unpaid is canceled after this long. */
export const PENDING_CHECKOUT_MINUTES = 60;
/** The provider is asked about pending checkouts older than this. */
export const RECONCILE_AFTER_MINUTES = 5;

/**
 * The acknowledgement the person ticks before paying (section 06). Its version is kept with the
 * transaction, so what was acknowledged is known for every payment.
 */
export const ACKNOWLEDGEMENT_VERSION = 'pro-no-refund-v1';

export const DAY_MS = 24 * 3600 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
