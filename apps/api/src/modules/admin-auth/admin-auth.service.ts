import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { ENV, type Env } from '../../config/env.js';
import type { AdminChallengeKind } from '../../generated/prisma/client.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { SecretBox } from '../../infrastructure/crypto/secret-box.js';
import { randomToken, sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import { AuditService } from '../audit/index.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import {
  ADMIN_CHALLENGE_MAX_ATTEMPTS,
  ADMIN_CHALLENGE_TTL_MINUTES,
  ADMIN_RATE_LIMITS,
  ADMIN_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_MAX_HOURS,
  ADMIN_SESSION_TOUCH_SECONDS,
  ADMIN_SIGN_IN_LOCK_MINUTES,
  ADMIN_SIGN_IN_MAX_FAILURES,
} from './admin-auth.policy.js';
import type { Grant } from './grants.js';
import { matchTotpStep, newTotpEnrollment, type TotpEnrollment } from './totp.js';

export interface AdminSignInStep {
  next: AdminChallengeKind;
  challengeToken: string;
  expiresAt: Date;
  /** Only for TOTP_ENROLL: the secret to add to an authenticator app. */
  enrollment: TotpEnrollment | null;
}

export interface AdminPrincipal {
  adminId: string;
  sessionId: string;
  email: string;
  fullName: string;
  grants: Grant[];
}

const clientKey = (client: ClientInfo) => client.ip ?? 'unknown';

/**
 * Admin login: password, then TOTP at every login; opaque cookie sessions with idle and absolute
 * timeouts (ADR-009). No session exists before the TOTP step succeeds.
 */
@Injectable()
export class AdminAuthService {
  private readonly secretBox: SecretBox;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly accounts: AdminAccountsService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {
    this.secretBox = new SecretBox(env.ADMIN_TOTP_ENCRYPTION_KEY);
  }

  async signIn(rawEmail: string, password: string, client: ClientInfo): Promise<AdminSignInStep> {
    await this.limiter.hit(ADMIN_RATE_LIMITS.signInPerIp, clientKey(client));
    const email = rawEmail.trim().toLowerCase();
    const admin = await this.prisma.adminAccount.findUnique({ where: { email } });
    if (!admin) {
      await this.hasher.verifyDecoy(password);
      throw new DomainError('INVALID_CREDENTIALS', 'Wrong e-mail or password.');
    }
    const audit = (action: string) =>
      this.audit.record({
        actorType: 'ADMIN',
        actorId: admin.id,
        action,
        entityType: 'AdminAccount',
        entityId: admin.id,
        ip: client.ip,
        userAgent: client.userAgent,
      });

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new DomainError('ACCOUNT_LOCKED', 'Too many wrong passwords.', {
        retryAt: admin.lockedUntil.toISOString(),
      });
    }
    if (!(await this.hasher.verify(admin.passwordHash, password))) {
      const lockedUntil = await this.registerFailedSignIn(admin.id);
      await audit(lockedUntil ? 'admin.sign_in.locked' : 'admin.sign_in.password_rejected');
      if (lockedUntil) {
        throw new DomainError('ACCOUNT_LOCKED', 'Too many wrong passwords.', {
          retryAt: lockedUntil.toISOString(),
        });
      }
      throw new DomainError('INVALID_CREDENTIALS', 'Wrong e-mail or password.');
    }
    if (admin.status !== 'ACTIVE') {
      await audit('admin.sign_in.refused_suspended');
      throw new DomainError('ACCOUNT_SUSPENDED', 'This admin account is suspended.');
    }

    const kind: AdminChallengeKind = admin.totpSecretEncrypted ? 'TOTP_VERIFY' : 'TOTP_ENROLL';
    const enrollment = kind === 'TOTP_ENROLL' ? newTotpEnrollment(admin.email) : null;
    const challengeToken = randomToken();
    const expiresAt = new Date(Date.now() + ADMIN_CHALLENGE_TTL_MINUTES * 60_000);
    await this.prisma.adminAuthChallenge.create({
      data: {
        adminId: admin.id,
        kind,
        tokenHash: sha256Hex(challengeToken),
        pendingSecretEncrypted: enrollment ? this.secretBox.seal(enrollment.secretBase32) : null,
        expiresAt,
      },
    });
    await this.prisma.adminAccount.update({
      where: { id: admin.id },
      data: { failedSignInCount: 0, lockedUntil: null },
    });
    return { next: kind, challengeToken, expiresAt, enrollment };
  }

  /** Second step: a valid TOTP code turns the challenge into a session. Returns the session token. */
  async completeTotp(
    challengeToken: string,
    code: string,
    client: ClientInfo,
  ): Promise<{ sessionToken: string; principal: AdminPrincipal }> {
    await this.limiter.hit(ADMIN_RATE_LIMITS.totpPerIp, clientKey(client));
    const now = new Date();
    const challenge = await this.prisma.adminAuthChallenge.findUnique({
      where: { tokenHash: sha256Hex(challengeToken) },
      include: { admin: true },
    });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) {
      throw new DomainError('CHALLENGE_INVALID', 'Sign in again.');
    }
    const { admin } = challenge;
    const sealedSecret =
      challenge.kind === 'TOTP_ENROLL'
        ? challenge.pendingSecretEncrypted
        : admin.totpSecretEncrypted;
    if (!sealedSecret || admin.status !== 'ACTIVE') {
      throw new DomainError('CHALLENGE_INVALID', 'Sign in again.');
    }

    const step = matchTotpStep(this.secretBox.open(sealedSecret), code, now.getTime());
    const replay =
      step !== null && admin.totpLastUsedStep !== null && BigInt(step) <= admin.totpLastUsedStep;
    if (step === null || replay) {
      const attempts = challenge.failedAttempts + 1;
      await this.prisma.adminAuthChallenge.update({
        where: { id: challenge.id },
        data: {
          failedAttempts: attempts,
          consumedAt: attempts >= ADMIN_CHALLENGE_MAX_ATTEMPTS ? now : null,
        },
      });
      await this.audit.record({
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'admin.totp.rejected',
        entityType: 'AdminAccount',
        entityId: admin.id,
        ip: client.ip,
        userAgent: client.userAgent,
      });
      if (attempts >= ADMIN_CHALLENGE_MAX_ATTEMPTS) {
        throw new DomainError('CHALLENGE_INVALID', 'Too many wrong codes. Sign in again.');
      }
      throw new DomainError('TOTP_INVALID', 'Wrong or already used code.', {
        attemptsRemaining: ADMIN_CHALLENGE_MAX_ATTEMPTS - attempts,
      });
    }

    const sessionToken = randomToken();
    const session = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.adminAuthChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new DomainError('CHALLENGE_INVALID', 'Sign in again.');
      const stepAccepted = await tx.adminAccount.updateMany({
        where: {
          id: admin.id,
          OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: BigInt(step) } }],
        },
        data: {
          totpLastUsedStep: BigInt(step),
          lastLoginAt: now,
          ...(challenge.kind === 'TOTP_ENROLL' ? { totpSecretEncrypted: sealedSecret } : {}),
        },
      });
      if (stepAccepted.count !== 1) throw new DomainError('TOTP_INVALID', 'Code already used.');
      return tx.adminSession.create({
        data: {
          adminId: admin.id,
          tokenHash: sha256Hex(sessionToken),
          ip: client.ip,
          userAgent: client.userAgent,
          expiresAt: new Date(now.getTime() + ADMIN_SESSION_MAX_HOURS * 3600_000),
        },
      });
    });

    if (challenge.kind === 'TOTP_ENROLL') {
      await this.audit.record({
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'admin.totp.enrolled',
        entityType: 'AdminAccount',
        entityId: admin.id,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    }
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      action: 'admin.sign_in.succeeded',
      entityType: 'AdminSession',
      entityId: session.id,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return {
      sessionToken,
      principal: {
        adminId: admin.id,
        sessionId: session.id,
        email: admin.email,
        fullName: admin.fullName,
        grants: await this.accounts.effectiveGrants(admin.id),
      },
    };
  }

  /** Resolves a session cookie; enforces the idle and absolute timeouts. */
  async resolveSession(sessionToken: string): Promise<AdminPrincipal> {
    const now = Date.now();
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: sha256Hex(sessionToken) },
      include: { admin: { select: { id: true, email: true, fullName: true, status: true } } },
    });
    const idleLimit = now - ADMIN_SESSION_IDLE_MINUTES * 60_000;
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now ||
      session.lastSeenAt.getTime() <= idleLimit ||
      session.admin.status !== 'ACTIVE'
    ) {
      throw new DomainError('UNAUTHENTICATED', 'Admin session expired. Sign in again.');
    }
    if (session.lastSeenAt.getTime() < now - ADMIN_SESSION_TOUCH_SECONDS * 1000) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }
    return {
      adminId: session.admin.id,
      sessionId: session.id,
      email: session.admin.email,
      fullName: session.admin.fullName,
      grants: await this.accounts.effectiveGrants(session.admin.id),
    };
  }

  async signOut(principal: AdminPrincipal, client: ClientInfo): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: principal.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: principal.adminId,
      action: 'admin.sign_out',
      entityType: 'AdminSession',
      entityId: principal.sessionId,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }

  /** Removes expired challenges and sessions ended more than a day ago (hourly job). */
  async purge(): Promise<void> {
    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    await this.prisma.adminAuthChallenge.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
    await this.prisma.adminSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: dayAgo } }, { revokedAt: { lt: dayAgo } }] },
    });
  }

  private async registerFailedSignIn(adminId: string): Promise<Date | null> {
    const [row] = await this.prisma.$queryRaw<{ locked_until: Date | null; locked_now: boolean }[]>`
      UPDATE admin_accounts SET
        failed_sign_in_count = CASE WHEN failed_sign_in_count + 1 >= ${ADMIN_SIGN_IN_MAX_FAILURES} THEN 0
                                    ELSE failed_sign_in_count + 1 END,
        locked_until = CASE WHEN failed_sign_in_count + 1 >= ${ADMIN_SIGN_IN_MAX_FAILURES}
                            THEN now() + make_interval(mins => ${ADMIN_SIGN_IN_LOCK_MINUTES})
                            ELSE locked_until END
      WHERE id = ${adminId}::uuid
      RETURNING locked_until, (failed_sign_in_count = 0) AS locked_now`;
    return row?.locked_now ? row.locked_until : null;
  }
}
