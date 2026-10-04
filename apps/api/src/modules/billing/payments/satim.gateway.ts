import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env.js';
import type { PaymentMethod, PaymentProvider } from '../../../generated/prisma/enums.js';
import {
  type OrderOutcome,
  PaymentGateway,
  PaymentProviderError,
  type RegisteredOrder,
  type RegisterOrder,
} from './payment-provider.js';

/** ISO 4217 numeric code SATIM expects. */
const NUMERIC_CURRENCY: Record<string, string> = { DZD: '012' };
/** SATIM's OrderStatus: 2 = amount deposited (paid). */
const ORDER_DEPOSITED = 2;
const PENDING_ORDER_STATUSES = new Set([0, 1, 5]);
const TIMEOUT_MS = 20_000;

type SatimResponse = Record<string, unknown>;

/** A scalar field of a SATIM response as text (numbers and strings vary between versions). */
function text(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : null;
}

/**
 * SATIM e-payment (CIB and Edahabia), contracted directly, over its REST API
 * (docs/operations/satim-setup.md):
 * `register.do` creates the order and returns the payment page; `confirmOrder.do` answers, server
 * to server, whether it was paid. Credentials come from the merchant contract with SATIM.
 */
@Injectable()
export class SatimGateway extends PaymentGateway {
  readonly id = 'satim' as const;
  readonly channels: Readonly<Partial<Record<PaymentMethod, PaymentProvider>>> = {
    CIB: 'SATIM_CIB',
    EDAHABIA: 'SATIM_EDAHABIA',
  };
  private readonly logger = new Logger(SatimGateway.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async register(order: RegisterOrder): Promise<RegisteredOrder> {
    const currency = NUMERIC_CURRENCY[order.currency];
    if (!currency) throw new PaymentProviderError(`Unsupported currency ${order.currency}`);
    const response = await this.call('register.do', {
      orderNumber: order.orderNumber,
      amount: String(order.amountMinor),
      currency,
      returnUrl: order.returnUrl,
      failUrl: order.returnUrl,
      description: order.description.slice(0, 100),
      language: order.language,
      jsonParams: JSON.stringify({
        force_terminal_id: this.env.SATIM_TERMINAL_ID,
        udf1: order.orderNumber,
      }),
    });
    const errorCode = text(response.errorCode) ?? text(response.ErrorCode) ?? '0';
    const orderId = typeof response.orderId === 'string' ? response.orderId : null;
    const formUrl = typeof response.formUrl === 'string' ? response.formUrl : null;
    if (errorCode !== '0' || !orderId || !formUrl) {
      throw new PaymentProviderError(this.message(response) ?? `SATIM register error ${errorCode}`);
    }
    return { providerReference: orderId, redirectUrl: formUrl };
  }

  async status(providerReference: string, language: 'FR' | 'EN'): Promise<OrderOutcome> {
    const response = await this.call('confirmOrder.do', { orderId: providerReference, language });
    const orderStatus = Number(response.OrderStatus ?? response.orderStatus);
    const details = this.details(response);
    if (orderStatus === ORDER_DEPOSITED && (text(response.actionCode) ?? '0') === '0') {
      return {
        status: 'PAID',
        paidAt: new Date(),
        amountMinor: Number(response.Amount ?? response.amount ?? response.depositAmount),
        details,
      };
    }
    if (PENDING_ORDER_STATUSES.has(orderStatus) && response.actionCode === undefined)
      return { status: 'PENDING' };
    return {
      status: 'FAILED',
      providerMessage: this.message(response) ?? 'Paiement refusé.',
      details,
    };
  }

  private async call(method: string, params: Record<string, string>): Promise<SatimResponse> {
    const body = new URLSearchParams({
      userName: this.env.SATIM_USERNAME ?? '',
      password: this.env.SATIM_PASSWORD ?? '',
      ...params,
    });
    let response: Response;
    try {
      response = await fetch(`${this.env.SATIM_BASE_URL}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`SATIM ${method} unreachable`, error);
      throw new PaymentProviderError('Service de paiement indisponible.', { cause: error });
    }
    if (!response.ok) {
      throw new PaymentProviderError(`Service de paiement indisponible (${response.status}).`);
    }
    return (await response.json()) as SatimResponse;
  }

  private message(response: SatimResponse): string | null {
    for (const key of ['actionCodeDescription', 'ErrorMessage', 'errorMessage']) {
      const value = response[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const params = response.params;
    if (params && typeof params === 'object' && 'respCode_desc' in params) {
      const description = (params as Record<string, unknown>).respCode_desc;
      if (typeof description === 'string' && description.trim()) return description.trim();
    }
    return null;
  }

  /** What is kept with the transaction: never a full card number (SATIM returns it masked). */
  private details(response: SatimResponse): Record<string, string> {
    const kept: Record<string, string> = {};
    for (const key of ['OrderNumber', 'approvalCode', 'actionCode', 'Pan', 'ErrorCode']) {
      const value = text(response[key]);
      if (value !== null) kept[key] = value;
    }
    return kept;
  }
}
