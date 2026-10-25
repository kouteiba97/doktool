// ADR-021: the SATIM adapter reads confirmOrder.do; a deposited order without a readable amount is
// never treated as paid (it stays pending for the reconciliation job).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { PaymentProviderError } from '../../src/modules/billing/payments/payment-provider.js';
import { SatimGateway } from '../../src/modules/billing/payments/satim.gateway.js';

const env = loadEnv({
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  USER_JWT_SECRET: 'x'.repeat(32),
  OTP_HMAC_SECRET: 'y'.repeat(32),
  ANALYTICS_SUBJECT_SECRET: 'a'.repeat(32),
  ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  ADMIN_WEB_ORIGIN: 'https://admin.doktool.dz',
  TERMS_VERSION: '2026-09',
  PAYMENT_GATEWAYS: 'satim',
  SATIM_BASE_URL: 'https://test2.satim.dz/payment/rest',
  SATIM_USERNAME: 'merchant',
  SATIM_PASSWORD: 'secret',
  SATIM_TERMINAL_ID: 'E010900000',
  PUBLIC_API_URL: 'https://api.doktool.dz',
});
const gateway = new SatimGateway(env);

function answer(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('SATIM confirmOrder', () => {
  it('reads a deposited order as paid, with its amount', async () => {
    answer({ OrderStatus: 2, actionCode: 0, Amount: 150000, approvalCode: 'A1' });
    await expect(gateway.status('order-1', 'FR')).resolves.toMatchObject({
      status: 'PAID',
      amountMinor: 150000,
    });
  });

  it('refuses a deposited order whose amount cannot be read', async () => {
    answer({ OrderStatus: 2, actionCode: 0 });
    await expect(gateway.status('order-2', 'FR')).rejects.toBeInstanceOf(PaymentProviderError);
  });
});
