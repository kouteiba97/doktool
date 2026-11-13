import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env.js';
import {
  retryableStatus,
  SMS_TIMEOUT_MS,
  SmsDeliveryError,
  SmsGateway,
  type SmsSent,
} from './sms-gateway.js';

/**
 * Twilio Programmable Messaging (docs/operations/sms-setup.md): `POST /2010-04-01/Accounts/{sid}/
 * Messages.json`, HTTP Basic with the account SID and auth token, form-encoded `To`, `Body` and
 * either `MessagingServiceSid` (recommended: it picks the sender per country) or `From`.
 */
@Injectable()
export class TwilioSms extends SmsGateway {
  readonly id = 'twilio' as const;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  /** Posts one SMS to Twilio with Basic authentication; returns Twilio's message id. */
  async send(to: string, text: string): Promise<SmsSent> {
    const sid = this.env.TWILIO_ACCOUNT_SID!;
    const form = new URLSearchParams({ To: to, Body: text });
    if (this.env.TWILIO_MESSAGING_SERVICE_SID) {
      form.set('MessagingServiceSid', this.env.TWILIO_MESSAGING_SERVICE_SID);
    } else {
      form.set('From', this.env.TWILIO_FROM!);
    }
    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${this.env.TWILIO_AUTH_TOKEN!}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: form,
          signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new SmsDeliveryError('Twilio unreachable', true, { cause: error });
    }
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof payload.code === 'number' ? ` ${payload.code}` : '';
      throw new SmsDeliveryError(
        `Twilio answered ${response.status}${code}`,
        retryableStatus(response.status),
      );
    }
    return { providerMessageId: typeof payload.sid === 'string' ? payload.sid : null };
  }
}
