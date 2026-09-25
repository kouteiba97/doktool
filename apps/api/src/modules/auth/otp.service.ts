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

export interface OtpChallengeView {
  challengeId: string;
  channel: Identifier['channel'];
  /** Masked destination for the OTP screen, e.g. "a•••@example.dz". */
  destinationHint: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

export interface ConsumedChallenge {
  userId: string;
  channel: Identifier['channel'];
}

const MESSAGE_KEYS: Record<OtpPurpose, { subject: string; text: string }> = {
  SIGN_UP: { subject: 'server.otp.signUp.subject', text: 'server.otp.signUp.text' },
  PASSWORD_RESET: {
    subject: 'server.otp.passwordReset.subject',
    text: 'server.otp.passwordReset.text',
  },
};

export function maskDestination(channel: Identifier['channel'], destination: string): string {
  if (channel === 'EMAIL') {
    const [local = '', domain = ''] = destination.split('@');
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return `${destination.slice(0, 5)}•••••${destination.slice(-2)}`;
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

/** One-time codes for sign-up confirmation and password reset (ADR-009). */
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
        codeHash: userId ? this.hash(id, code) : this.hash(id, randomToken()),
        expiresAt: minutesFromNow(OTP_TTL_MINUTES),
      },
    });
    if (userId) await this.send(purpose, identifier, code, locale);
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
        codeHash: challenge.userId
          ? this.hash(challenge.id, code)
          : this.hash(challenge.id, randomToken()),
        expiresAt: minutesFromNow(OTP_TTL_MINUTES),
        failedAttempts: 0,
        lockedUntil: null,
        sendCount: { increment: 1 },
        lastSentAt: now,
      },
    });
    if (challenge.userId) {
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
    purpose: OtpPurpose,
    code: string,
  ): Promise<ConsumedChallenge> {
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

    if (challenge.userId && hexDigestsEqual(challenge.codeHash, this.hash(challenge.id, code))) {
      const { count } = await this.prisma.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (count === 1) return { userId: challenge.userId, channel: challenge.channel };
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

  /** Deletes challenges expired for more than a day (hourly maintenance job). */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    return count;
  }

  private hash(challengeId: string, code: string): string {
    return hmacSha256Hex(this.env.OTP_HMAC_SECRET, `${challengeId}:${code}`);
  }

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
