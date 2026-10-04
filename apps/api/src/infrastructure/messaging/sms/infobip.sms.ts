import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env.js';
import {
  retryableStatus,
  SMS_TIMEOUT_MS,
  SmsDeliveryError,
  SmsGateway,
  type SmsSent,
} from './sms-gateway.js';

interface InfobipMessage {
  messageId?: string;
  status?: { groupName?: string; name?: string };
}

/**
 * Infobip SMS (docs/operations/sms-setup.md): `POST {base}/sms/3/messages` with
 * `Authorization: App <key>` and `{ messages: [{ sender, destinations: [{ to }], content: { text } }] }`.
 * Numbers go without the `+`. A message in the REJECTED group is refused for this number.
 */
@Injectable()
export class InfobipSms extends SmsGateway {
  readonly id = 'infobip' as const;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async send(to: string, text: string): Promise<SmsSent> {
    let response: Response;
    try {
      response = await fetch(`${this.env.INFOBIP_BASE_URL!}/sms/3/messages`, {
        method: 'POST',
        headers: {
          Authorization: `App ${this.env.INFOBIP_API_KEY!}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              sender: this.env.INFOBIP_SENDER!,
              destinations: [{ to: to.replace(/^\+/, '') }],
              content: { text },
            },
          ],
        }),
        signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
      });
    } catch (error) {
      throw new SmsDeliveryError('Infobip unreachable', true, { cause: error });
    }
    const payload = (await response.json().catch(() => ({}))) as { messages?: InfobipMessage[] };
    if (!response.ok) {
      throw new SmsDeliveryError(
        `Infobip answered ${response.status}`,
        retryableStatus(response.status),
      );
    }
    const message = payload.messages?.[0];
    if (message?.status?.groupName === 'REJECTED') {
      throw new SmsDeliveryError(
        `Infobip rejected the message (${message.status.name ?? 'REJECTED'})`,
        false,
      );
    }
    return { providerMessageId: message?.messageId ?? null };
  }
}
