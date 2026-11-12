// ADR-021: the Chargily Pay adapter speaks Chargily's v2 API (whole dinars, merchant-paid fees),
// maps every checkout status, and accepts only webhooks signed with the secret key.
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { ChargilyGateway } from '../../src/modules/billing/payments/chargily.gateway.js';
import {
  PaymentProviderError,
  type RegisterOrder,
} from '../../src/modules/billing/payments/payment-provider.js';

const SECRET = 'test_sk_0123456789abcdefghijklmnop';
const env = loadEnv({
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  USER_JWT_SECRET: 'x'.repeat(32),
  OTP_HMAC_SECRET: 'y'.repeat(32),
  ANALYTICS_SUBJECT_SECRET: 'a'.repeat(32),
  ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  ADMIN_WEB_ORIGIN: 'https://admin.doktool.dz',
  TERMS_VERSION: '2026-09',
  PAYMENT_GATEWAYS: 'chargily',
  CHARGILY_SECRET_KEY: SECRET,
  PUBLIC_API_URL: 'https://api.doktool.dz',
});
const gateway = new ChargilyGateway(env);

const order: RegisterOrder = {
  transactionId: 'DT-2026-000042',
  orderNumber: '26000042',
  amountMinor: 150_000,
  currency: 'DZD',
  method: 'EDAHABIA',
  description: 'DokTool Pro PRO_MONTHLY DT-2026-000042',
  language: 'EN',
  returnUrl: 'https://api.doktool.dz/v1/subscription/checkout/return?transactionId=DT-2026-000042',
  webhookUrl: 'https://api.doktool.dz/v1/payments/webhooks/chargily',
};

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('ChargilyGateway.register', () => {
  it('creates a checkout in whole dinars with fees on the merchant', async () => {
    const fetchMock = answer(200, {
      id: '01hj5n7cqpaf0mt2d0xx85tgz8',
      status: 'pending',
      checkout_url: 'https://pay.chargily.dz/test/checkouts/01hj5n7cqpaf0mt2d0xx85tgz8/pay',
    });
    await expect(gateway.register(order)).resolves.toEqual({
      providerReference: '01hj5n7cqpaf0mt2d0xx85tgz8',
      redirectUrl: 'https://pay.chargily.dz/test/checkouts/01hj5n7cqpaf0mt2d0xx85tgz8/pay',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pay.chargily.net/test/api/v2/checkouts');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 1500,
      currency: 'dzd',
      payment_method: 'edahabia',
      success_url: order.returnUrl,
      failure_url: order.returnUrl,
      webhook_endpoint: order.webhookUrl,
      description: order.description,
      locale: 'en',
      chargily_pay_fees_allocation: 'merchant',
      metadata: { transactionId: 'DT-2026-000042' },
    });
  });

  it('refuses amounts Chargily cannot take, before calling it', async () => {
    const fetchMock = answer(200, {});
    await expect(gateway.register({ ...order, amountMinor: 150_050 })).rejects.toThrow(
      PaymentProviderError,
    );
    await expect(gateway.register({ ...order, amountMinor: 4_900 })).rejects.toThrow(
      PaymentProviderError,
    );
    await expect(gateway.register({ ...order, currency: 'EUR' })).rejects.toThrow(
      PaymentProviderError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the validation message Chargily gives, and a neutral one when it is down', async () => {
    answer(422, { message: 'The success url field must be a valid URL.' });
    await expect(gateway.register(order)).rejects.toMatchObject({
      providerMessage: 'The success url field must be a valid URL.',
    });
    answer(503, {});
    await expect(gateway.register(order)).rejects.toMatchObject({
      providerMessage: 'Service de paiement indisponible (503).',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(gateway.register(order)).rejects.toMatchObject({
      providerMessage: 'Service de paiement indisponible.',
    });
  });
});

describe('ChargilyGateway.status', () => {
  it('reports a paid checkout in centimes with the merchant fee', async () => {
    const fetchMock = answer(200, {
      id: 'chk_1',
      status: 'paid',
      amount: 1500,
      fees: 38,
      fees_on_merchant: 38,
      fees_on_customer: 0,
      livemode: false,
      payment_method: 'edahabia',
      updated_at: 1_760_000_000,
    });
    await expect(gateway.status('chk_1')).resolves.toEqual({
      status: 'PAID',
      paidAt: new Date(1_760_000_000_000),
      amountMinor: 150_000,
      feesMinor: 3_800,
      details: {
        checkoutId: 'chk_1',
        status: 'paid',
        paymentMethod: 'edahabia',
        livemode: 'false',
      },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://pay.chargily.net/test/api/v2/checkouts/chk_1',
    );
  });

  it.each([
    ['pending', 'PENDING'],
    ['processing', 'PENDING'],
    ['failed', 'FAILED'],
    ['canceled', 'FAILED'],
    ['expired', 'FAILED'],
  ])('maps %s to %s', async (status, expected) => {
    answer(200, { id: 'chk_2', status, amount: 1500 });
    expect((await gateway.status('chk_2')).status).toBe(expected);
  });

  // A failed transaction is final: only a status known to mean "not charged" may close one.
  it.each([['refunded'], [''], [undefined]])(
    'leaves the order open on a status it does not know (%s)',
    async (status) => {
      answer(200, { id: 'chk_4', ...(status === undefined ? {} : { status }), amount: 1500 });
      await expect(gateway.status('chk_4')).rejects.toBeInstanceOf(PaymentProviderError);
    },
  );

  it('refuses a paid checkout in another currency than the dinar', async () => {
    answer(200, { id: 'chk_5', status: 'paid', amount: 1500, currency: 'eur' });
    await expect(gateway.status('chk_5')).rejects.toBeInstanceOf(PaymentProviderError);
    answer(200, { id: 'chk_5', status: 'paid', amount: 1500, currency: 'dzd' });
    expect((await gateway.status('chk_5')).status).toBe('PAID');
  });
});

describe('ChargilyGateway.verifyWebhook', () => {
  const body = Buffer.from(
    JSON.stringify({
      id: 'evt_1',
      entity: 'event',
      type: 'checkout.paid',
      data: { id: 'chk_3', entity: 'checkout', status: 'paid', amount: 1500 },
    }),
  );
  const sign = (payload: Buffer, key = SECRET) =>
    createHmac('sha256', key).update(payload).digest('hex');

  it('accepts the exact body signed with the secret key, and names the checkout', () => {
    expect(gateway.verifyWebhook(body, { signature: sign(body) })).toEqual({
      providerReference: 'chk_3',
    });
  });

  it('refuses a missing, wrong or foreign signature and a tampered body', () => {
    expect(gateway.verifyWebhook(body, {})).toBeNull();
    expect(gateway.verifyWebhook(body, { signature: 'not-hex' })).toBeNull();
    expect(gateway.verifyWebhook(body, { signature: sign(body, 'test_sk_other') })).toBeNull();
    const tampered = Buffer.from(body.toString().replace('1500', '15'));
    expect(gateway.verifyWebhook(tampered, { signature: sign(body) })).toBeNull();
  });

  it('ignores signed events that are not about a checkout', () => {
    const other = Buffer.from(JSON.stringify({ type: 'customer.created', data: { id: 'c' } }));
    expect(gateway.verifyWebhook(other, { signature: sign(other) })).toBeNull();
  });
});
