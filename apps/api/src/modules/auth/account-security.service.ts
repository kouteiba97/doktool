import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { Language } from '../../generated/prisma/client.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { MessageDelivery } from '../../infrastructure/messaging/message-delivery.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import { AuditService } from '../audit/index.js';
import { type Identifier, parseIdentifier, UsersService } from '../users/index.js';
import { RATE_LIMITS } from './auth.policy.js';
import { type OtpChallengeView, OtpService } from './otp.service.js';
import { SecurityNoticesService } from './security-notices.service.js';
import { SessionsService } from './sessions.service.js';

const clientKey = (client: ClientInfo) => client.ip ?? 'unknown';
/** Name of a contact kind in audit entries and notices. */
const channelName = (channel: Identifier['channel']) => (channel === 'EMAIL' ? 'EMAIL' : 'PHONE');

/**
 * Settings › Compte (ADR-023): add, change or remove the e-mail or phone, and change the
 * password. Every change asks for the current password (a borrowed unlocked phone is not
 * enough), a new contact is proven with a code sent to it, and the person is told on their
 * other contact — the earliest warning if someone else is at work.
 */
@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
    private readonly delivery: MessageDelivery,
    private readonly limiter: RateLimiter,
    private readonly notices: SecurityNoticesService,
    private readonly audit: AuditService,
  ) {}

  /** Sends a code to the e-mail or phone to add (or to replace the current one of its kind). */
  async requestContact(
    userId: string,
    input: { identifier: string; password: string; language: Language },
  ): Promise<OtpChallengeView> {
    await this.checkPassword(userId, input.password);
    const identifier = parseIdentifier(input.identifier);
    if (!identifier) {
      throw new DomainError('VALIDATION_FAILED', 'Enter a valid e-mail address or mobile number.', {
        fields: { identifier: ['Enter a valid e-mail address or mobile number.'] },
      });
    }
    const contacts = (await this.users.contactsOf(userId))!;
    const current = identifier.channel === 'EMAIL' ? contacts.email : contacts.phone;
    if (current === identifier.value) {
      throw new DomainError('INVALID_STATE', 'This is already your contact.');
    }
    if (!this.delivery.canReach(identifier.channel, identifier.value)) {
      throw new DomainError('CHANNEL_UNAVAILABLE', 'Codes cannot be sent to this contact.');
    }
    const holder = await this.users.findAccountIdByContact(identifier);
    if (holder && holder !== userId) {
      throw new DomainError('ACCOUNT_EXISTS', 'Another account already uses this contact.');
    }
    await this.limiter.hit(RATE_LIMITS.otpResendPerDestination, identifier.value);
    return this.otp.issue('CONTACT_CHANGE', identifier, userId, input.language);
  }

  /** The code was received: the contact is added (or replaces the previous one of its kind). */
  async confirmContact(
    userId: string,
    input: { challengeId: string; code: string },
    client: ClientInfo,
  ): Promise<void> {
    await this.limiter.hit(RATE_LIMITS.otpVerifyPerIp, clientKey(client));
    const proof = await this.otp.consume(input.challengeId, 'CONTACT_CHANGE', input.code);
    if (proof.userId !== userId) throw new DomainError('OTP_EXPIRED', 'This code is not yours.');
    const identifier = { channel: proof.channel, value: proof.destination };
    const replaced = await this.users.setContact(userId, identifier);
    const kind = channelName(identifier.channel);
    await this.audit.record({
      actorType: 'USER',
      actorId: userId,
      action: replaced ? 'user.contact_replaced' : 'user.contact_added',
      entityType: 'User',
      entityId: userId,
      after: { channel: kind },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    if (replaced) {
      // The old contact hears it was replaced; the account's main contact hears it too.
      await this.notices.notify(userId, 'contactReplaced', { channel: kind }, [
        { channel: identifier.channel, to: replaced },
      ]);
    } else {
      await this.notices.notify(userId, 'contactAdded', { channel: kind });
    }
  }

  /** Removes the e-mail or the phone, keeping the other (confirmed) one. */
  async removeContact(
    userId: string,
    channel: Identifier['channel'],
    password: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.checkPassword(userId, password);
    const removed = await this.users.removeContact(userId, channel);
    await this.audit.record({
      actorType: 'USER',
      actorId: userId,
      action: 'user.contact_removed',
      entityType: 'User',
      entityId: userId,
      after: { channel: channelName(channel) },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    await this.notices.notify(userId, 'contactRemoved', { channel: channelName(channel) }, [
      { channel, to: removed },
    ]);
  }

  /** Changes the password; every other device signs out, this one stays signed in. */
  async changePassword(
    userId: string,
    sessionId: string,
    input: { currentPassword: string; newPassword: string },
    client: ClientInfo,
  ): Promise<void> {
    await this.checkPassword(userId, input.currentPassword, 'currentPassword');
    const contacts = (await this.users.contactsOf(userId))!;
    const lowered = input.newPassword.trim().toLowerCase();
    if (lowered === contacts.email || lowered === contacts.phone) {
      throw new DomainError('VALIDATION_FAILED', 'The password cannot be your e-mail or phone.', {
        fields: { newPassword: ['The password cannot be your e-mail or phone.'] },
      });
    }
    await this.users.setPassword(userId, await this.hasher.hash(input.newPassword));
    await this.sessions.revokeOthers(userId, sessionId, 'PASSWORD_CHANGED');
    await this.audit.record({
      actorType: 'USER',
      actorId: userId,
      action: 'user.password_changed',
      entityType: 'User',
      entityId: userId,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    await this.notices.notify(userId, 'passwordChanged');
  }

  /** Rate-limited check of the current password; a wrong one is a field error, not a sign-out. */
  private async checkPassword(userId: string, password: string, field = 'password'): Promise<void> {
    await this.limiter.hit(RATE_LIMITS.accountChangePerUser, userId);
    const hash = await this.users.passwordHashOf(userId);
    if (!hash) throw new DomainError('UNAUTHENTICATED', 'The account no longer exists.');
    if (!(await this.hasher.verify(hash, password))) {
      throw new DomainError('VALIDATION_FAILED', 'Wrong password.', {
        fields: { [field]: ['Wrong password.'] },
      });
    }
  }
}
