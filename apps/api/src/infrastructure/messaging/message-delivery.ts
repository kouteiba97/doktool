import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { InfobipSms } from './sms/infobip.sms.js';
import { maskPhone, SmsDeliveryError, type SmsGateway } from './sms/sms-gateway.js';
import { TwilioSms } from './sms/twilio.sms.js';

export type DeliveryChannel = 'EMAIL' | 'SMS';

export interface OutgoingMessage {
  channel: DeliveryChannel;
  /** E-mail address or E.164 phone number. */
  to: string;
  /** E-mail subject; ignored for SMS. */
  subject: string;
  text: string;
}

/** SMS cost guards (ADR-022): a number gets at most this many texts a day, whatever the purpose. */
const SMS_PER_NUMBER_PER_DAY = 10;
const DAY_SECONDS = 24 * 3600;

/**
 * Sends one-time codes and security notices (ADR-009, ADR-022).
 * - E-mail: SMTP when SMTP_URL is set (mandatory in production).
 * - SMS: the providers of SMS_GATEWAYS, in order; a provider that fails for a temporary reason
 *   hands over to the next. Only numbers of SMS_ALLOWED_COUNTRY_CODES are texted (SMS pumping),
 *   each at most 10 times a day, and the whole server at most SMS_DAILY_LIMIT times a day.
 * - Development without a provider: the message is written to the log. Test: kept in `sent` only.
 */
@Injectable()
export class MessageDelivery {
  private readonly logger = new Logger(MessageDelivery.name);
  private readonly transport: Transporter | null;
  private readonly smsGateways: readonly SmsGateway[];
  /** Messages delivered without a real provider (development and test), newest last, capped. */
  readonly sent: OutgoingMessage[] = [];
  private static readonly SENT_CAP = 200;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly limiter: RateLimiter,
    twilio: TwilioSms,
    infobip: InfobipSms,
  ) {
    this.transport = env.SMTP_URL ? createTransport(env.SMTP_URL) : null;
    const all: Record<SmsGateway['id'], SmsGateway> = { twilio, infobip };
    this.smsGateways = env.SMS_GATEWAYS.map((id) => all[id]);
  }

  isAvailable(channel: DeliveryChannel): boolean {
    if (this.env.NODE_ENV !== 'production') return true;
    return channel === 'EMAIL' ? this.transport !== null : this.smsGateways.length > 0;
  }

  /** Whether a code can be sent to this destination at all (channel configured, country allowed). */
  canReach(channel: DeliveryChannel, to: string): boolean {
    if (!this.isAvailable(channel)) return false;
    return channel === 'EMAIL' || this.smsCountryAllowed(to);
  }

  async send(message: OutgoingMessage): Promise<void> {
    if (!this.isAvailable(message.channel)) {
      throw new DomainError(
        'CHANNEL_UNAVAILABLE',
        `${message.channel} delivery is not configured on this server.`,
      );
    }
    if (message.channel === 'EMAIL' && this.transport) {
      await this.transport.sendMail({
        from: this.env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      return;
    }
    if (message.channel === 'SMS') {
      if (!this.smsCountryAllowed(message.to)) {
        throw new DomainError('CHANNEL_UNAVAILABLE', 'SMS cannot be sent to this country.');
      }
      if (this.smsGateways.length > 0) {
        await this.sendSms(message.to, message.text);
        return;
      }
    }
    this.sent.push(message);
    if (this.sent.length > MessageDelivery.SENT_CAP) this.sent.shift();
    if (this.env.NODE_ENV === 'development') {
      this.logger.warn(
        `[${message.channel} not sent — development] to ${message.to}: ${message.text}`,
      );
    }
  }

  private smsCountryAllowed(phone: string): boolean {
    return this.env.SMS_ALLOWED_COUNTRY_CODES.some((code) => phone.startsWith(`+${code}`));
  }

  private async sendSms(to: string, text: string): Promise<void> {
    // Cost guards first: a burst against one number, or across the server, stops here.
    await this.limiter.hit(
      { name: 'sms:number', limit: SMS_PER_NUMBER_PER_DAY, windowSeconds: DAY_SECONDS },
      to,
    );
    try {
      await this.limiter.hit(
        { name: 'sms:server', limit: this.env.SMS_DAILY_LIMIT, windowSeconds: DAY_SECONDS },
        'all',
      );
    } catch (error) {
      this.logger.error(
        `Daily SMS limit (${this.env.SMS_DAILY_LIMIT}) reached: SMS paused until tomorrow`,
      );
      throw error;
    }
    let lastError: unknown;
    for (const gateway of this.smsGateways) {
      try {
        const { providerMessageId } = await gateway.send(to, text);
        this.logger.log(
          `SMS to ${maskPhone(to)} accepted by ${gateway.id} (${providerMessageId ?? 'no id'})`,
        );
        return;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof SmsDeliveryError ? error.retryable : true;
        this.logger.warn(
          `SMS to ${maskPhone(to)} failed on ${gateway.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (!retryable) break;
      }
    }
    throw new DomainError(
      'CHANNEL_UNAVAILABLE',
      `The SMS could not be sent; try again later (${lastError instanceof Error ? lastError.message : 'no provider'}).`,
    );
  }
}
