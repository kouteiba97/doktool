// ADR-022: SMS go through the configured providers in order, with a fallback on temporary
// failures, only to allowed countries, under per-number and server-wide daily ceilings; the
// providers' wire formats are those of their APIs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../src/common/errors/domain-error.js';
import { type Env, loadEnv } from '../../src/config/env.js';
import { MessageDelivery } from '../../src/infrastructure/messaging/message-delivery.js';
import { InfobipSms } from '../../src/infrastructure/messaging/sms/infobip.sms.js';
import { SmsDeliveryError } from '../../src/infrastructure/messaging/sms/sms-gateway.js';
import { TwilioSms } from '../../src/infrastructure/messaging/sms/twilio.sms.js';
import type { RateLimiter } from '../../src/infrastructure/rate-limit/rate-limiter.js';

const TWILIO_SID = `AC${'0'.repeat(32)}`;

function environment(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    DATABASE_URL: 'postgresql://u@localhost:5432/db',
    USER_JWT_SECRET: 'x'.repeat(32),
    OTP_HMAC_SECRET: 'y'.repeat(32),
    ANALYTICS_SUBJECT_SECRET: 'a'.repeat(32),
    ADMIN_TOTP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    ADMIN_WEB_ORIGIN: 'https://admin.doktool.dz',
    TERMS_VERSION: '2026-09',
    // A complete production environment, so availability is the production one.
    NODE_ENV: 'production',
    STORAGE_DRIVER: 'r2',
    R2_ACCOUNT_ID: 'acc',
    R2_CONTENT_ACCESS_KEY_ID: 'a',
    R2_CONTENT_SECRET_ACCESS_KEY: 'b',
    R2_PRIVATE_ACCESS_KEY_ID: 'c',
    R2_PRIVATE_SECRET_ACCESS_KEY: 'd',
    TERMS_URL: 'https://doktool.dz/cgu',
    PRIVACY_URL: 'https://doktool.dz/confidentialite',
    PAYMENT_GATEWAYS: 'chargily',
    CHARGILY_MODE: 'live',
    CHARGILY_SECRET_KEY: 'live_sk_0123',
    PUBLIC_API_URL: 'https://api.doktool.dz',
    SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
    MAIL_FROM: 'DokTool <no-reply@example.com>',
    SMS_GATEWAYS: 'infobip,twilio',
    INFOBIP_BASE_URL: 'https://abc123.api.infobip.com/',
    INFOBIP_API_KEY: 'infobip-key',
    INFOBIP_SENDER: 'DokTool',
    TWILIO_ACCOUNT_SID: TWILIO_SID,
    TWILIO_AUTH_TOKEN: 'twilio-token',
    TWILIO_FROM: 'DokTool',
    ...overrides,
  });
}

/** A limiter that counts hits in memory, failing like the real one past the limit. */
function memoryLimiter(): RateLimiter {
  const hits = new Map<string, number>();
  return {
    hit: (rule: { name: string; limit: number }, subject: string) => {
      const key = `${rule.name}:${subject}`;
      const count = (hits.get(key) ?? 0) + 1;
      hits.set(key, count);
      return count > rule.limit
        ? Promise.reject(new DomainError('RATE_LIMITED', rule.name))
        : Promise.resolve();
    },
  } as unknown as RateLimiter;
}

function delivery(env: Env) {
  return new MessageDelivery(env, memoryLimiter(), new TwilioSms(env), new InfobipSms(env));
}

const sms = (to = '+213661234567') => ({
  channel: 'SMS' as const,
  to,
  subject: '',
  text: 'DokTool : votre code est 123456.',
});

function respond(...answers: { status: number; body: unknown }[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('SMS providers', () => {
  it('sends with Infobip v3: App key, number without +, sender and text', async () => {
    const fetchMock = respond({
      status: 200,
      body: { messages: [{ messageId: 'm-1', status: { groupName: 'PENDING' } }] },
    });
    await expect(
      new InfobipSms(environment()).send('+213661234567', 'Code 123456'),
    ).resolves.toEqual({ providerMessageId: 'm-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://abc123.api.infobip.com/sms/3/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('App infobip-key');
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [
        {
          sender: 'DokTool',
          destinations: [{ to: '213661234567' }],
          content: { text: 'Code 123456' },
        },
      ],
    });
  });

  it('treats an Infobip REJECTED message as a refusal of the number, not a retry', async () => {
    respond({
      status: 200,
      body: { messages: [{ status: { groupName: 'REJECTED', name: 'REJECTED_DESTINATION' } }] },
    });
    const failure = await new InfobipSms(environment())
      .send('+213661234567', 'x')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SmsDeliveryError);
    expect((failure as SmsDeliveryError).retryable).toBe(false);
  });

  it('sends with Twilio: Basic auth, form fields, Messaging Service when configured', async () => {
    const fetchMock = respond({ status: 201, body: { sid: 'SM1' } });
    const env = environment({ TWILIO_MESSAGING_SERVICE_SID: `MG${'1'.repeat(32)}` });
    await expect(new TwilioSms(env).send('+213661234567', 'Code 123456')).resolves.toEqual({
      providerMessageId: 'SM1',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${TWILIO_SID}:twilio-token`).toString('base64')}`,
    );
    const form = new URLSearchParams(init.body as URLSearchParams);
    expect(Object.fromEntries(form)).toEqual({
      To: '+213661234567',
      Body: 'Code 123456',
      MessagingServiceSid: `MG${'1'.repeat(32)}`,
    });
  });
});

describe('MessageDelivery (SMS)', () => {
  it('falls back to the next provider when the first fails for a temporary reason', async () => {
    const fetchMock = respond({ status: 503, body: {} }, { status: 201, body: { sid: 'SM2' } });
    await delivery(environment()).send(sms());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('api.twilio.com');
  });

  it('does not try another provider when the number itself is refused', async () => {
    const fetchMock = respond({ status: 400, body: {} });
    await expect(delivery(environment()).send(sms())).rejects.toMatchObject({
      code: 'CHANNEL_UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('texts only allowed countries, and says so before any code is issued', async () => {
    const fetchMock = respond();
    const service = delivery(environment());
    expect(service.canReach('SMS', '+213661234567')).toBe(true);
    expect(service.canReach('SMS', '+33612345678')).toBe(false);
    expect(service.canReach('EMAIL', 'a@b.dz')).toBe(true);
    await expect(service.send(sms('+33612345678'))).rejects.toMatchObject({
      code: 'CHANNEL_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      delivery(environment({ SMS_ALLOWED_COUNTRY_CODES: '213, +33' })).canReach(
        'SMS',
        '+33612345678',
      ),
    ).toBe(true);
  });

  it('caps texts per number and per server each day', async () => {
    const body = { messages: [{ messageId: 'm', status: { groupName: 'PENDING' } }] };
    respond(...Array.from({ length: 12 }, () => ({ status: 200, body })));
    const service = delivery(environment());
    for (let index = 0; index < 10; index += 1) await service.send(sms());
    await expect(service.send(sms())).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    respond(...Array.from({ length: 3 }, () => ({ status: 200, body })));
    const capped = delivery(environment({ SMS_DAILY_LIMIT: '2' }));
    await capped.send(sms('+213661111111'));
    await capped.send(sms('+213662222222'));
    await expect(capped.send(sms('+213663333333'))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('has no SMS in production without a provider', () => {
    const service = delivery(environment({ SMS_GATEWAYS: '' }));
    expect(service.isAvailable('SMS')).toBe(false);
    expect(service.canReach('SMS', '+213661234567')).toBe(false);
  });
});

describe('SMS settings', () => {
  it('requires each provider’s settings and refuses unknown providers', () => {
    expect(() => environment({ INFOBIP_API_KEY: '' })).toThrow(/INFOBIP_API_KEY/);
    expect(() => environment({ TWILIO_FROM: '' })).toThrow(
      /TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM/,
    );
    expect(() => environment({ SMS_GATEWAYS: 'carrier-pigeon' })).toThrow();
    expect(() => environment({ TWILIO_ACCOUNT_SID: 'nope' })).toThrow(/starts with AC/);
    expect(() => environment({ INFOBIP_BASE_URL: 'http://abc.api.infobip.com' })).toThrow(/https/);
  });
});
