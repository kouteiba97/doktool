import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';

export type DeliveryChannel = 'EMAIL' | 'SMS';

export interface OutgoingMessage {
  channel: DeliveryChannel;
  /** E-mail address or E.164 phone number. */
  to: string;
  /** E-mail subject; ignored for SMS. */
  subject: string;
  text: string;
}

/**
 * Sends OTP messages (ADR-009).
 * - E-mail: SMTP when SMTP_URL is set (mandatory in production).
 * - SMS: no provider is contracted yet, so SMS is unavailable in production.
 * - Development without SMTP: the message is written to the log. Test: kept in `sent` only.
 */
@Injectable()
export class MessageDelivery {
  private readonly logger = new Logger(MessageDelivery.name);
  private readonly transport: Transporter | null;
  /** Messages delivered without a real provider (development and test), newest last, capped. */
  readonly sent: OutgoingMessage[] = [];
  private static readonly SENT_CAP = 200;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport = env.SMTP_URL ? createTransport(env.SMTP_URL) : null;
  }

  isAvailable(channel: DeliveryChannel): boolean {
    if (this.env.NODE_ENV !== 'production') return true;
    return channel === 'EMAIL' ? this.transport !== null : false;
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
    this.sent.push(message);
    if (this.sent.length > MessageDelivery.SENT_CAP) this.sent.shift();
    if (this.env.NODE_ENV === 'development') {
      this.logger.warn(
        `[${message.channel} not sent — development] to ${message.to}: ${message.text}`,
      );
    }
  }
}
