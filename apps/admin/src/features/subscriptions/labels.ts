import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import type { BadgeTone } from '@/ui/badge';

export type SubscriptionStatus = Schemas['SubscriptionStatus'];
export type PaymentProvider = Schemas['PaymentProvider'];
export type TransactionStatus = Schemas['TransactionStatus'];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, MessageKey> = {
  PENDING_PAYMENT: 'admin.subscriptions.statusPendingPayment',
  ACTIVE: 'admin.subscriptions.statusActive',
  GRACE: 'admin.subscriptions.statusGrace',
  EXPIRED: 'admin.subscriptions.statusExpired',
  CANCELED: 'admin.subscriptions.statusCanceled',
};

/** Calm tones only (Lock L39): no red for a subscription. */
export const SUBSCRIPTION_STATUS_TONES: Record<SubscriptionStatus, BadgeTone> = {
  PENDING_PAYMENT: 'neutral',
  ACTIVE: 'success',
  GRACE: 'info',
  EXPIRED: 'neutral',
  CANCELED: 'outline',
};

export const PROVIDER_LABELS: Record<PaymentProvider, MessageKey> = {
  SATIM_CIB: 'admin.transactions.providerCib',
  SATIM_EDAHABIA: 'admin.transactions.providerEdahabia',
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, MessageKey> = {
  PENDING: 'admin.transactions.statusPending',
  SUCCEEDED: 'admin.transactions.statusSucceeded',
  FAILED: 'admin.transactions.statusFailed',
  CANCELED: 'admin.transactions.statusCanceled',
};

export const TRANSACTION_STATUS_TONES: Record<TransactionStatus, BadgeTone> = {
  PENDING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'warning',
  CANCELED: 'neutral',
};
