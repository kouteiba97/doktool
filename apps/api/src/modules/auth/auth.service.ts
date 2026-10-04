import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { ENV, type Env } from '../../config/env.js';
import type { Language } from '../../generated/prisma/client.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { MessageDelivery } from '../../infrastructure/messaging/message-delivery.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import { type Identifier, parseIdentifier, UsersService } from '../users/index.js';
import { RATE_LIMITS } from './auth.policy.js';
import { AccountRecoveryService } from './account-recovery.service.js';
import { type OtpChallengeView, OtpService } from './otp.service.js';
import { SecurityNoticesService } from './security-notices.service.js';
import { type AuthTokens, type DeviceInput, SessionsService } from './sessions.service.js';

export interface SignUpInput {
  identifier: string;
  password: string;
  firstName: string;
  lastName: string;
  wilayaCode: number;
  termsVersion: string;
  language: Language;
}

const clientKey = (client: ClientInfo) => client.ip ?? 'unknown';

function requireIdentifier(raw: string): Identifier {
  const identifier = parseIdentifier(raw);
  if (!identifier) {
    throw new DomainError('VALIDATION_FAILED', 'Enter a valid e-mail address or mobile number.', {
      fields: { identifier: ['Enter a valid e-mail address or mobile number.'] },
    });
  }
  return identifier;
}

function assertPasswordAllowed(password: string, identifier: Identifier): void {
  if (password.trim().toLowerCase() === identifier.value.toLowerCase()) {
    throw new DomainError('VALIDATION_FAILED', 'The password cannot be the identifier.', {
      fields: { password: ['The password cannot be the identifier.'] },
    });
  }
}

/** User sign-up, confirmation, sign-in, refresh, sign-out and password reset (ADR-009). */
@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
    private readonly limiter: RateLimiter,
    private readonly delivery: MessageDelivery,
    private readonly recovery: AccountRecoveryService,
    private readonly notices: SecurityNoticesService,
  ) {}

  async signUp(input: SignUpInput, client: ClientInfo): Promise<OtpChallengeView> {
    await this.limiter.hit(RATE_LIMITS.signUpPerIp, clientKey(client));
    const identifier = requireIdentifier(input.identifier);
    assertPasswordAllowed(input.password, identifier);
    if (input.termsVersion !== this.env.TERMS_VERSION) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'The terms have changed; show the current version.',
        {
          fields: { termsVersion: [`Current version is ${this.env.TERMS_VERSION}.`] },
        },
      );
    }
    if (!this.delivery.canReach(identifier.channel, identifier.value)) {
      throw new DomainError(
        'CHANNEL_UNAVAILABLE',
        `${identifier.channel} confirmation is not available for this identifier.`,
      );
    }
    const { userId } = await this.users.createOrRestartPendingAccount({
      identifier,
      passwordHash: await this.hasher.hash(input.password),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      wilayaCode: input.wilayaCode,
      termsVersion: input.termsVersion,
      language: input.language,
    });
    return this.otp.issue('SIGN_UP', identifier, userId, input.language);
  }

  async confirmSignUp(
    challengeId: string,
    code: string,
    device: DeviceInput,
    client: ClientInfo,
  ): Promise<AuthTokens> {
    await this.limiter.hit(RATE_LIMITS.otpVerifyPerIp, clientKey(client));
    const { userId, channel } = await this.otp.consume(challengeId, 'SIGN_UP', code);
    await this.users.markIdentifierConfirmed(userId, channel);
    await this.users.clearSignInFailures(userId);
    return this.sessions.open(userId, device, client);
  }

  resendCode(challengeId: string, language: Language): Promise<OtpChallengeView> {
    return this.otp.resend(challengeId, language);
  }

  async signIn(
    rawIdentifier: string,
    password: string,
    device: DeviceInput,
    client: ClientInfo,
  ): Promise<AuthTokens> {
    await this.limiter.hit(RATE_LIMITS.signInPerIp, clientKey(client));
    const identifier = requireIdentifier(rawIdentifier);
    const candidate = await this.users.findSignInCandidate(identifier);
    if (!candidate || candidate.status === 'DELETED') {
      await this.hasher.verifyDecoy(password);
      throw new DomainError('INVALID_CREDENTIALS', 'Wrong identifier or password.');
    }
    if (candidate.lockedUntil && candidate.lockedUntil > new Date()) {
      throw new DomainError('ACCOUNT_LOCKED', 'Too many wrong passwords.', {
        retryAt: candidate.lockedUntil.toISOString(),
      });
    }
    if (!(await this.hasher.verify(candidate.passwordHash, password))) {
      const lockedUntil = await this.users.registerFailedSignIn(candidate.id);
      if (lockedUntil) {
        throw new DomainError('ACCOUNT_LOCKED', 'Too many wrong passwords.', {
          retryAt: lockedUntil.toISOString(),
        });
      }
      throw new DomainError('INVALID_CREDENTIALS', 'Wrong identifier or password.');
    }
    if (candidate.status === 'SUSPENDED') {
      throw new DomainError('ACCOUNT_SUSPENDED', 'This account is suspended.');
    }
    if (!candidate.identifierConfirmed) {
      throw new DomainError(
        'IDENTIFIER_NOT_CONFIRMED',
        'Confirm this identifier first: sign up again to receive a new code.',
      );
    }
    await this.users.clearSignInFailures(candidate.id);
    // The owner has the account: a recovery someone else asked for stops here (ADR-023).
    await this.recovery.cancelForOwner(candidate.id);
    return this.sessions.open(candidate.id, device, client);
  }

  refresh(refreshToken: string, deviceId: string, client: ClientInfo): Promise<AuthTokens> {
    return this.limiter
      .hit(RATE_LIMITS.refreshPerIp, clientKey(client))
      .then(() => this.sessions.refresh(refreshToken, deviceId, client));
  }

  signOut(userId: string, sessionId: string): Promise<void> {
    return this.sessions.revoke(userId, sessionId, 'SIGN_OUT');
  }

  /** Always answers with a challenge, whether or not the identifier has an account. */
  async requestPasswordReset(
    rawIdentifier: string,
    language: Language,
    client: ClientInfo,
  ): Promise<OtpChallengeView> {
    await this.limiter.hit(RATE_LIMITS.resetPerIp, clientKey(client));
    const identifier = requireIdentifier(rawIdentifier);
    await this.limiter.hit(RATE_LIMITS.resetPerIdentifier, identifier.value);
    if (!this.delivery.canReach(identifier.channel, identifier.value)) {
      throw new DomainError(
        'CHANNEL_UNAVAILABLE',
        `${identifier.channel} codes are not available for this identifier.`,
      );
    }
    const userId = await this.users.findConfirmedActiveUserId(identifier);
    return this.otp.issue('PASSWORD_RESET', identifier, userId, language);
  }

  async confirmPasswordReset(
    challengeId: string,
    code: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.limiter.hit(RATE_LIMITS.otpVerifyPerIp, clientKey(client));
    const { userId } = await this.otp.consume(challengeId, 'PASSWORD_RESET', code);
    await this.users.setPassword(userId, await this.hasher.hash(newPassword));
    await this.sessions.revokeAll(userId, 'PASSWORD_RESET');
    await this.notices.notify(userId, 'passwordReset');
  }
}
