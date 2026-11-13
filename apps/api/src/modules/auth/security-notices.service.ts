import { Injectable, Logger } from '@nestjs/common';
import type { Language, MessageChannel } from '../../generated/prisma/client.js';
import { MessageDelivery } from '../../infrastructure/messaging/message-delivery.js';
import { ServerMessages } from '../../infrastructure/messaging/server-messages.js';
import { NotificationsService } from '../notifications/index.js';
import { UsersService } from '../users/index.js';

/** What happened to the account; each has `server.security.<kind>.subject|text` texts. */
export type SecurityEvent =
  | 'passwordChanged'
  | 'passwordReset'
  | 'contactAdded'
  | 'contactReplaced'
  | 'contactRemoved'
  | 'recoveryRequested'
  | 'recoveryApproved';

/** Messages to the new contact of a recovery, which is not (yet) on the account. */
export type RecoveryContactEvent =
  | 'recoveryReceived'
  | 'recoveryAccepted'
  | 'recoveryRejected'
  | 'recoveryRestored'
  | 'recoveryCanceled'
  /** To the contacts an applied recovery replaced. */
  | 'recoveryApplied';

const IN_APP: Partial<Record<SecurityEvent, string>> = {
  passwordChanged: 'mobile.notifications.securityPasswordChanged',
  contactAdded: 'mobile.notifications.securityContactAdded',
  contactRemoved: 'mobile.notifications.securityContactRemoved',
  recoveryRequested: 'mobile.notifications.securityRecoveryRequested',
  recoveryApproved: 'mobile.notifications.securityRecoveryApproved',
};

/** Values of a notice: identifiers and codes as text, moments as dates (formatted per language). */
export type NoticeValues = Record<string, string | Date>;

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Africa/Algiers',
};

/** Where a message goes: a channel and an address. */
export interface Destination {
  channel: MessageChannel;
  to: string;
}

/**
 * Tells the person when something changes how their account is reached (ADR-023): password,
 * contacts, recovery. Sent to the account's confirmed contacts (e-mail first; SMS only when it is
 * the only contact, since texts cost money) and, while signed in, as an in-app notification.
 * A notice that cannot be sent is logged and never blocks the change itself.
 */
@Injectable()
export class SecurityNoticesService {
  private readonly logger = new Logger(SecurityNoticesService.name);

  constructor(
    private readonly users: UsersService,
    private readonly delivery: MessageDelivery,
    private readonly messages: ServerMessages,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Notifies the account. `extraDestinations` also receive it (e.g. the contact that was just
   * replaced or removed, which is no longer on the account).
   */
  async notify(
    userId: string,
    event: SecurityEvent,
    values: NoticeValues = {},
    extraDestinations: Destination[] = [],
  ): Promise<void> {
    const contacts = await this.users.contactsOf(userId);
    if (!contacts || contacts.status === 'DELETED') return;
    const destinations: Destination[] = [...extraDestinations];
    if (contacts.email && contacts.emailConfirmed) {
      destinations.push({ channel: 'EMAIL', to: contacts.email });
    } else if (contacts.phone && contacts.phoneConfirmed) {
      destinations.push({ channel: 'SMS', to: contacts.phone });
    }
    const unique = destinations.filter(
      (destination, index) => destinations.findIndex((d) => d.to === destination.to) === index,
    );
    for (const destination of unique) {
      await this.send(destination, `server.security.${event}`, contacts.language, {
        firstName: contacts.firstName,
        ...values,
      });
    }
    const key = IN_APP[event];
    if (key) {
      await this.notifications
        .notify({
          userId,
          type: `security.${event}`,
          messageKey: key,
          params: Object.fromEntries(
            Object.entries(values).map(([name, value]) => [
              name,
              value instanceof Date ? value.toISOString() : value,
            ]),
          ),
        })
        .catch((error: unknown) => this.logger.error(`In-app notice ${event} failed`, error));
    }
  }

  /** A message to the new contact of an account recovery. */
  async toRecoveryContact(
    destination: Destination,
    event: RecoveryContactEvent,
    language: Language,
    values: NoticeValues = {},
  ): Promise<void> {
    await this.send(destination, `server.security.${event}`, language, values);
  }

  /**
   * Formats a notice in the person's language (dates in Algiers time) and sends it; failures are
   * only logged.
   */
  private async send(
    destination: Destination,
    key: string,
    language: Language,
    raw: NoticeValues,
  ): Promise<void> {
    const locale = language === 'EN' ? 'en-GB' : 'fr-FR';
    const values = Object.fromEntries(
      Object.entries(raw).map(([name, value]) => [
        name,
        value instanceof Date ? new Intl.DateTimeFormat(locale, DATE_FORMAT).format(value) : value,
      ]),
    );
    try {
      await this.delivery.send({
        channel: destination.channel,
        to: destination.to,
        subject: this.messages.format(language, `${key}.subject`, values),
        text: this.messages.format(language, `${key}.text`, values),
      });
    } catch (error) {
      this.logger.error(`Security notice ${key} could not be sent`, error);
    }
  }
}
