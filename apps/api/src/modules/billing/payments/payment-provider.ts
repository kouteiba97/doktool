import type { IncomingHttpHeaders } from 'node:http';
import type { GATEWAY_IDS } from '../../../config/env.js';
import type { PaymentMethod, PaymentProvider } from '../../../generated/prisma/enums.js';

export type GatewayId = (typeof GATEWAY_IDS)[number];

export interface RegisterOrder {
  /** Our public transaction id (DT-YYYY-NNNNNN), kept by the gateway as order metadata. */
  transactionId: string;
  /** Short order number derived from the transaction id (≤ 10 characters, for SATIM). */
  orderNumber: string;
  amountMinor: number;
  /** ISO 4217 alphabetic code; DZD in V1. */
  currency: string;
  method: PaymentMethod;
  description: string;
  language: 'FR' | 'EN';
  /** Where the payment page sends the person back (success or failure). */
  returnUrl: string;
  /** Where the gateway posts its signed notifications, for gateways that send them. */
  webhookUrl: string;
}

export interface RegisteredOrder {
  /** The gateway's order id, kept as the transaction's provider reference. */
  providerReference: string;
  /** The gateway's payment page. */
  redirectUrl: string;
}

export type OrderOutcome =
  | {
      status: 'PAID';
      paidAt: Date;
      amountMinor: number;
      /** The fee the gateway kept, when it reports it; otherwise finance estimates it. */
      feesMinor?: number;
      details: Record<string, string>;
    }
  | { status: 'PENDING' }
  | { status: 'FAILED'; providerMessage: string; details: Record<string, string> };

/** A verified notification names the order it is about; its content is never trusted as is. */
export interface WebhookNotice {
  providerReference: string;
}

/** The gateway refused or could not be reached; its message is shown to the person. */
export class PaymentProviderError extends Error {
  constructor(
    readonly providerMessage: string,
    options?: { cause?: unknown },
  ) {
    super(`Payment provider error: ${providerMessage}`, options);
  }
}

/**
 * A card-payment gateway (ADR-015, ADR-021). The API never sees card data: the person pays on the
 * gateway's page and the API asks the gateway, server to server, what happened. Adding a gateway
 * is one class extending this one, its channels in the `PaymentProvider` enum, and its settings in
 * `config/env.ts`; nothing else changes (checkout, finance, the app).
 */
export abstract class PaymentGateway {
  abstract readonly id: GatewayId;

  /** The channel recorded on a transaction for each method this gateway accepts. */
  abstract readonly channels: Readonly<Partial<Record<PaymentMethod, PaymentProvider>>>;

  abstract register(order: RegisterOrder): Promise<RegisteredOrder>;

  /** The gateway's authoritative status of an order. */
  abstract status(providerReference: string, language: 'FR' | 'EN'): Promise<OrderOutcome>;

  /**
   * Checks a notification's signature against the raw body. Returns the order it is about, or
   * null when it is not authentic (or the gateway sends none). The order is then confirmed with
   * {@link status}, never from the notification's content.
   */
  verifyWebhook(_rawBody: Buffer, _headers: IncomingHttpHeaders): WebhookNotice | null {
    return null;
  }
}
