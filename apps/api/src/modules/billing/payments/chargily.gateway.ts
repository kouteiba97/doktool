import { createHmac } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env.js';
import type { PaymentMethod, PaymentProvider } from '../../../generated/prisma/enums.js';
import { hexDigestsEqual } from '../../../infrastructure/crypto/tokens.js';
import {
  type OrderOutcome,
  PaymentGateway,
  PaymentProviderError,
  type RegisteredOrder,
  type RegisterOrder,
  type WebhookNotice,
} from './payment-provider.js';

/** Chargily Pay v2 API roots (dev.chargily.com/pay-v2/api-reference/introduction). */
export const CHARGILY_API = {
  test: 'https://pay.chargily.net/test/api/v2',
  live: 'https://pay.chargily.net/api/v2',
} as const;

/** Chargily's names for the methods it accepts. */
const METHOD_NAMES: Record<PaymentMethod, string> = { CIB: 'cib', EDAHABIA: 'edahabia' };
const PENDING_STATUSES = new Set(['pending', 'processing']);
/** Chargily's smallest accepted checkout amount, in dinars. */
const MINIMUM_DINARS = 50;
const TIMEOUT_MS = 20_000;

type Json = Record<string, unknown>;

const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

/**
 * Chargily Pay (CIB of SATIM and EDAHABIA of Algérie Poste) over its v2 REST API
 * (docs/operations/chargily-setup.md). A checkout is created for each payment; its status is read
 * back server to server, and Chargily's signed webhook only triggers that read.
 *
 * Amounts: Chargily counts whole dinars, the API counts centimes. Fees are always the merchant's
 * (`chargily_pay_fees_allocation: merchant`): the person pays exactly the price shown in the app.
 */
@Injectable()
export class ChargilyGateway extends PaymentGateway {
  readonly id = 'chargily' as const;
  readonly channels: Readonly<Partial<Record<PaymentMethod, PaymentProvider>>> = {
    CIB: 'CHARGILY_CIB',
    EDAHABIA: 'CHARGILY_EDAHABIA',
  };
  private readonly logger = new Logger(ChargilyGateway.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async register(order: RegisterOrder): Promise<RegisteredOrder> {
    if (order.currency !== 'DZD') {
      throw new PaymentProviderError(`Unsupported currency ${order.currency}`);
    }
    if (order.amountMinor % 100 !== 0 || order.amountMinor / 100 < MINIMUM_DINARS) {
      throw new PaymentProviderError(
        `Chargily accepts whole amounts of at least ${MINIMUM_DINARS} DZD.`,
      );
    }
    const checkout = await this.call('POST', '/checkouts', {
      amount: order.amountMinor / 100,
      currency: 'dzd',
      payment_method: METHOD_NAMES[order.method],
      success_url: order.returnUrl,
      failure_url: order.returnUrl,
      webhook_endpoint: order.webhookUrl,
      description: order.description.slice(0, 255),
      locale: order.language === 'EN' ? 'en' : 'fr',
      chargily_pay_fees_allocation: 'merchant',
      metadata: { transactionId: order.transactionId },
    });
    const id = typeof checkout.id === 'string' ? checkout.id : null;
    const url = typeof checkout.checkout_url === 'string' ? checkout.checkout_url : null;
    if (!id || !url) throw new PaymentProviderError('Réponse inattendue du service de paiement.');
    return { providerReference: id, redirectUrl: url };
  }

  async status(providerReference: string): Promise<OrderOutcome> {
    const checkout = await this.call('GET', `/checkouts/${encodeURIComponent(providerReference)}`);
    const status = typeof checkout.status === 'string' ? checkout.status : '';
    if (PENDING_STATUSES.has(status)) return { status: 'PENDING' };
    const details: Record<string, string> = { checkoutId: providerReference, status };
    if (typeof checkout.payment_method === 'string')
      details.paymentMethod = checkout.payment_method;
    if (typeof checkout.livemode === 'boolean') details.livemode = String(checkout.livemode);
    if (status === 'paid') {
      const dinars = integer(checkout.amount);
      const fees = integer(checkout.fees_on_merchant) ?? integer(checkout.fees);
      const updated = integer(checkout.updated_at);
      if (dinars === null) throw new PaymentProviderError('Montant absent de la réponse.');
      return {
        status: 'PAID',
        paidAt: updated ? new Date(updated * 1000) : new Date(),
        amountMinor: dinars * 100,
        ...(fees === null ? {} : { feesMinor: fees * 100 }),
        details,
      };
    }
    // failed, canceled, expired: the person was not charged.
    return {
      status: 'FAILED',
      providerMessage:
        status === 'canceled' || status === 'expired' ? 'Paiement annulé.' : 'Paiement refusé.',
      details,
    };
  }

  /** `signature` header = hex HMAC-SHA256 of the raw body with the API secret key. */
  override verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookNotice | null {
    const signature = headers.signature;
    if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return null;
    const expected = createHmac('sha256', this.secret()).update(rawBody).digest('hex');
    if (!hexDigestsEqual(signature.toLowerCase(), expected)) return null;
    let event: Json;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as Json;
    } catch {
      return null;
    }
    const data = event.data as Json | undefined;
    if (data?.entity !== 'checkout' || typeof data.id !== 'string') return null;
    return { providerReference: data.id };
  }

  private async call(method: 'GET' | 'POST', path: string, body?: Json): Promise<Json> {
    let response: Response;
    try {
      response = await fetch(`${CHARGILY_API[this.env.CHARGILY_MODE]}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secret()}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Chargily ${method} ${path} unreachable`, error);
      throw new PaymentProviderError('Service de paiement indisponible.', { cause: error });
    }
    const payload = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok) {
      // 4xx bodies carry a readable message (validation); never log the request (it has no
      // secrets, but the key is in the header).
      const message = typeof payload.message === 'string' ? payload.message : null;
      this.logger.warn(`Chargily ${method} ${path} answered ${response.status}: ${message ?? ''}`);
      throw new PaymentProviderError(
        response.status >= 500 || !message
          ? `Service de paiement indisponible (${response.status}).`
          : message,
      );
    }
    return payload;
  }

  private secret(): string {
    const key = this.env.CHARGILY_SECRET_KEY;
    if (!key) throw new PaymentProviderError('Chargily n’est pas configuré.');
    return key;
  }
}
