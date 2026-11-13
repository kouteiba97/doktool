import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';
import type { OtpPurpose } from '../../generated/prisma/client.js';
import {
  hexDigestsEqual,
  hmacSha256Hex,
  randomNumericCode,
  randomToken,
} from '../../infrastructure/crypto/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MessageDelivery } from '../../infrastructure/messaging/message-delivery.js';
import {
  type MessageLocale,
  ServerMessages,
} from '../../infrastructure/messaging/server-messages.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import type { Identifier } from '../users/index.js';
import {
  OTP_DIGITS,
  OTP_LOCK_MINUTES,
  OTP_MAX_FAILED_ATTEMPTS,
  OTP_MAX_SENDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  RATE_LIMITS,
} from './auth.policy.js';

/** What the app needs to show the code screen. */
export interface OtpChallengeView {
  challengeId: string;
  channel: Identifier['channel'];
  /** Masked destination for the OTP screen, e.g. "a•••@example.dz". */
  destinationHint: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

/** A code that was accepted: whose account and which contact it proves. */
export interface ConsumedChallenge {
  userId: string;
  channel: Identifier['channel'];
  /** The e-mail or E.164 phone the code went to (the contact being added, for CONTACT_CHANGE). */
  destination: string;
}

/** A proven contact: the person received the code sent there (account recovery). */
export interface ProvenContact {
  channel: Identifier['channel'];
  destination: string;
}

/** Catalogue keys of the code message, per purpose. */
const MESSAGE_KEYS: Record<OtpPurpose, { subject: string; text: string }> = {
  SIGN_UP: { subject: 'server.otp.signUp.subject', text: 'server.otp.signUp.text' },
  PASSWORD_RESET: {
    subject: 'server.otp.passwordReset.subject',
    text: 'server.otp.passwordReset.text',
  },
  CONTACT_CHANGE: {
    subject: 'server.otp.contactChange.subject',
    text: 'server.otp.contactChange.text',
  },
  ACCOUNT_RECOVERY: {
    subject: 'server.otp.accountRecovery.subject',
    text: 'server.otp.accountRecovery.text',
  },
};

/**
 * Whether a challenge's code is really sent. A password reset for an unknown identifier sends
 * nothing (no enumeration); an account recovery proves a contact that belongs to no account yet,
 * so its code is always sent.
 */
const delivers = (purpose: OtpPurpose, userId: string | null) =>
  userId !== null || purpose === 'ACCOUNT_RECOVERY';

/** Hides most of an e-mail or phone for display ("a•••@x.dz", "+2136•••••67"). */
export function maskDestination(channel: Identifier['channel'], destination: string): string {
  if (channel === 'EMAIL') {
    const [local = '', domain = ''] = destination.split('@');
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return `${destination.slice(0, 5)}•••••${destination.slice(-2)}`;
}

/** The moment `minutes` from now. */
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

/** One-time codes: sign-up, password reset (ADR-009), contact change and account recovery (ADR-023). */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly delivery: MessageDelivery,
    private readonly messages: ServerMessages,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * Creates a challenge and sends its code. With `userId = null` (password reset for an unknown
   * identifier) a challenge is still created and answered identically, but nothing is sent and no
   * code can ever match it.
   */
  async issue(
    purpose: OtpPurpose,
    identifier: Identifier,
    userId: string | null,
    locale: MessageLocale,
  ): Promise<OtpChallengeView> {
    const id = randomUUID();
    const code = randomNumericCode(OTP_DIGITS);
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        id,
        purpose,
        channel: identifier.channel,
        destination: identifier.value,
        userId,
        codeHash: delivers(purpose, userId) ? this.hash(id, code) : this.hash(id, randomToken()),
        expiresAt: minutesFromNow(OTP_TTL_MINUTES),
      },
    });
    if (delivers(purpose, userId)) await this.send(purpose, identifier, code, locale);
    return this.view(challenge);
  }

  /** Sends a new code for the same challenge (60 s cooldown, 5 sends max, blocked while locked). */
  async resend(challengeId: string, locale: MessageLocale): Promise<OtpChallengeView> {
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    const now = new Date();
    if (!challenge || challenge.consumedAt) {
      throw new DomainError('OTP_EXPIRED', 'This code request is no longer valid.');
    }
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      throw new DomainError('OTP_LOCKED', 'Too many wrong codes.', {
        retryAt: challenge.lockedUntil.toISOString(),
      });
    }
    const resendAt = new Date(challenge.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000);
    if (resendAt > now) {
      throw new DomainError('OTP_RESEND_TOO_SOON', 'Wait before asking for a new code.', {
        retryAt: resendAt.toISOString(),
      });
    }
    if (challenge.sendCount >= OTP_MAX_SENDS) {
      throw new DomainError('OTP_SEND_LIMIT', 'No more codes can be sent for this request.');
    }
    await this.limiter.hit(RATE_LIMITS.otpResendPerDestination, challenge.destination);

    const code = randomNumericCode(OTP_DIGITS);
    const updated = await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        codeHash: delivers(challenge.purpose, challenge.userId)
          ? this.hash(challenge.id, code)
          : this.hash(challenge.id, randomToken()),
        expiresAt: minutesFromNow(OTP_TTL_MINUTES),
        failedAttempts: 0,
        lockedUntil: null,
        sendCount: { increment: 1 },
        lastSentAt: now,
      },
    });
    if (delivers(challenge.purpose, challenge.userId)) {
      await this.send(
        challenge.purpose,
        { channel: challenge.channel, value: challenge.destination },
        code,
        locale,
      );
    }
    return this.view(updated);
  }

  /**
   * Checks a code and consumes the challenge. Wrong codes count; the third locks the challenge
   * for 10 minutes. Only a challenge of the expected purpose can be consumed.
   */
  async consume(
    challengeId: string,
    purpose: Exclude<OtpPurpose, 'ACCOUNT_RECOVERY'>,
    code: string,
  ): Promise<ConsumedChallenge> {
    const challenge = await this.verify(challengeId, purpose, code);
    if (!challenge.userId) throw new DomainError('OTP_INVALID', 'Wrong code.');
    return {
      userId: challenge.userId,
      channel: challenge.channel,
      destination: challenge.destination,
    };
  }

  /** Account recovery: the code proves the person receives messages at this new contact. */
  async consumeContactProof(challengeId: string, code: string): Promise<ProvenContact> {
    const challenge = await this.verify(challengeId, 'ACCOUNT_RECOVERY', code);
    return { channel: challenge.channel, destination: challenge.destination };
  }

  /**
   * Checks a code: right purpose, not used, not expired, not locked. A right code consumes the
   * challenge once; a wrong one counts towards the lock.
   */
  private async verify(challengeId: string, purpose: OtpPurpose, code: string) {
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    const now = new Date();
    if (
      !challenge ||
      challenge.purpose !== purpose ||
      challenge.consumedAt ||
      challenge.expiresAt <= now
    ) {
      throw new DomainError('OTP_EXPIRED', 'This code has expired. Ask for a new one.');
    }
    if (challenge.lockedUntil && challenge.lockedUntil > now) {
      throw new DomainError('OTP_LOCKED', 'Too many wrong codes.', {
        retryAt: challenge.lockedUntil.toISOString(),
      });
    }

    if (
      delivers(challenge.purpose, challenge.userId) &&
      hexDigestsEqual(challenge.codeHash, this.hash(challenge.id, code))
    ) {
      const { count } = await this.prisma.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (count === 1) return challenge;
      throw new DomainError('OTP_EXPIRED', 'This code has already been used.');
    }

    const [row] = await this.prisma.$queryRaw<
      { failed_attempts: number; locked_until: Date | null }[]
    >`
      UPDATE otp_challenges SET
        failed_attempts = CASE WHEN failed_attempts + 1 >= ${OTP_MAX_FAILED_ATTEMPTS} THEN 0
                               ELSE failed_attempts + 1 END,
        locked_until = CASE WHEN failed_attempts + 1 >= ${OTP_MAX_FAILED_ATTEMPTS}
                            THEN now() + make_interval(mins => ${OTP_LOCK_MINUTES})
                            ELSE locked_until END
      WHERE id = ${challenge.id}::uuid
      RETURNING failed_attempts, locked_until`;
    if (row?.locked_until && row.locked_until > now) {
      throw new DomainError('OTP_LOCKED', 'Too many wrong codes.', {
        retryAt: row.locked_until.toISOString(),
      });
    }
    throw new DomainError('OTP_INVALID', 'Wrong code.', {
      attemptsRemaining:
        OTP_MAX_FAILED_ATTEMPTS - (row?.failed_attempts ?? OTP_MAX_FAILED_ATTEMPTS),
    });
  }

  /** Account deletion: no code of the person is left to confirm. */
  async eraseUser(userId: string): Promise<void> {
    await this.prisma.otpChallenge.deleteMany({ where: { userId } });
  }

  /** Deletes challenges expired for more than a day (hourly maintenance job). */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    return count;
  }

  /** HMAC of the code bound to its challenge: the code itself is never stored. */
  private hash(challengeId: string, code: string): string {
    return hmacSha256Hex(this.env.OTP_HMAC_SECRET, `${challengeId}:${code}`);
  }

  /** Formats the code message in the person's language and sends it. */
  private async send(
    purpose: OtpPurpose,
    identifier: Identifier,
    code: string,
    locale: MessageLocale,
  ): Promise<void> {
    const keys = MESSAGE_KEYS[purpose];
    await this.delivery.send({
      channel: identifier.channel,
      to: identifier.value,
      subject: this.messages.format(locale, keys.subject),
      text: this.messages.format(locale, keys.text, { code, minutes: OTP_TTL_MINUTES }),
    });
  }

  /** Builds the public view of a challenge (masked destination, timers). */
  private view(challenge: {
    id: string;
    channel: Identifier['channel'];
    destination: string;
    expiresAt: Date;
    lastSentAt: Date;
  }): OtpChallengeView {
    return {
      challengeId: challenge.id,
      channel: challenge.channel,
      destinationHint: maskDestination(challenge.channel, challenge.destination),
      expiresAt: challenge.expiresAt,
      resendAvailableAt: new Date(
        challenge.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
      ),
    };
  }
}
