import type { PaymentProvider as ProviderMethod } from '../../../generated/prisma/enums.js';

export interface RegisterOrder {
  /** Our short order number (unique, ≤ 10 characters for SATIM). */
  orderNumber: string;
  amountMinor: number;
  /** ISO 4217 alphabetic code; DZD in V1. */
  currency: string;
  method: ProviderMethod;
  description: string;
  language: 'FR' | 'EN';
  /** Where the payment page sends the person back (success or failure). */
  returnUrl: string;
}

export interface RegisteredOrder {
  /** The provider's order id, kept as the transaction's provider reference. */
  providerReference: string;
  /** The provider's payment page. */
  redirectUrl: string;
}

export type OrderOutcome =
  | { status: 'PAID'; paidAt: Date; amountMinor: number; details: Record<string, string> }
  | { status: 'PENDING' }
  | { status: 'FAILED'; providerMessage: string; details: Record<string, string> };

/** The provider refused or could not be reached; its message is shown to the person. */
export class PaymentProviderError extends Error {
  constructor(
    readonly providerMessage: string,
    options?: { cause?: unknown },
  ) {
    super(`Payment provider error: ${providerMessage}`, options);
  }
}

/**
 * A card-payment provider (ADR-015). The API never sees card data: the person pays on the
 * provider's page and the API asks the provider, server to server, what happened.
 */
export abstract class PaymentGateway {
  abstract register(order: RegisterOrder): Promise<RegisteredOrder>;

  /** The provider's authoritative status of an order. */
  abstract status(providerReference: string, language: 'FR' | 'EN'): Promise<OrderOutcome>;
}
