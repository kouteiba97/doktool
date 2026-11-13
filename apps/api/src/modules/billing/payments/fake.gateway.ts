import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env.js';
import type { PaymentMethod, PaymentProvider } from '../../../generated/prisma/enums.js';
import {
  type OrderOutcome,
  PaymentGateway,
  type RegisteredOrder,
  type RegisterOrder,
} from './payment-provider.js';

/** The fee the fake gateway reports, like Chargily's 2.5 % (illustrative only). */
const FAKE_FEE_RATE = 0.025;

/** An order kept in memory with the outcome chosen on the fake page. */
interface FakeOrder {
  order: RegisterOrder;
  outcome: 'PENDING' | 'PAID' | 'FAILED';
}

/**
 * Development and test stand-in for Chargily, the default gateway (refused in production by the
 * environment check): it records Chargily's channels and reports a fee like Chargily does. Its
 * payment page is served by the API itself and lets the developer choose the outcome.
 */
@Injectable()
export class FakeGateway extends PaymentGateway {
  readonly id = 'fake' as const;
  readonly channels: Readonly<Partial<Record<PaymentMethod, PaymentProvider>>> = {
    CIB: 'CHARGILY_CIB',
    EDAHABIA: 'CHARGILY_EDAHABIA',
  };
  private readonly orders = new Map<string, FakeOrder>();

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  /** Keeps the order in memory and points to the API's own fake payment page. */
  register(order: RegisterOrder): Promise<RegisteredOrder> {
    const providerReference = `fake-${randomUUID()}`;
    this.orders.set(providerReference, { order, outcome: 'PENDING' });
    const base = this.env.PUBLIC_API_URL ?? `http://localhost:${this.env.PORT}`;
    return Promise.resolve({
      providerReference,
      redirectUrl: `${base}/v1/subscription/checkout/fake-page?orderId=${providerReference}`,
    });
  }

  /** The outcome chosen on the fake page (pending until a button is pressed). */
  status(providerReference: string): Promise<OrderOutcome> {
    const fake = this.orders.get(providerReference);
    if (!fake || fake.outcome === 'PENDING') return Promise.resolve({ status: 'PENDING' });
    if (fake.outcome === 'PAID') {
      return Promise.resolve({
        status: 'PAID',
        paidAt: new Date(),
        amountMinor: fake.order.amountMinor,
        feesMinor: Math.round(fake.order.amountMinor * FAKE_FEE_RATE),
        details: { approvalCode: 'FAKE00', Pan: '6280****0000' },
      });
    }
    return Promise.resolve({
      status: 'FAILED',
      providerMessage: 'Paiement refusé (simulation).',
      details: {},
    });
  }

  /** The fake page's buttons: returns where the person goes back, or null for an unknown order. */
  settle(providerReference: string, outcome: 'PAID' | 'FAILED'): string | null {
    const fake = this.orders.get(providerReference);
    if (!fake) return null;
    fake.outcome = outcome;
    return fake.order.returnUrl;
  }

  /** The order shown on the fake page. */
  describe(providerReference: string): RegisterOrder | null {
    return this.orders.get(providerReference)?.order ?? null;
  }
}
