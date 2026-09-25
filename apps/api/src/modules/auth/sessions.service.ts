import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { DevicePlatform, SessionRevocationReason } from '../../generated/prisma/client.js';
import { randomToken, sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { UserTokens } from '../../infrastructure/security/user-tokens.js';
import { UsersService } from '../users/index.js';
import {
  DAY_MS,
  REFRESH_TOKEN_TTL_DAYS,
  SESSION_MAX_AGE_DAYS,
  SESSION_RETENTION_DAYS,
} from './auth.policy.js';

export interface DeviceInput {
  id: string;
  name?: string;
  platform: DevicePlatform;
}

export interface AuthTokens {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SessionView {
  id: string;
  deviceName: string | null;
  platform: DevicePlatform;
  createdAt: Date;
  lastUsedAt: Date;
}

type RefreshOutcome =
  | { kind: 'rotated'; userId: string; sessionId: string; refreshToken: string; expiresAt: Date }
  | { kind: 'rejected'; message: string };

interface RefreshRow {
  token_id: string;
  session_id: string;
  token_expires_at: Date;
  used_at: Date | null;
  user_id: string;
  device_id: string;
  revoked_at: Date | null;
  session_expires_at: Date;
}

/** Device sessions and rotating refresh tokens (ADR-009). */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: UserTokens,
    private readonly users: UsersService,
  ) {}

  async open(userId: string, device: DeviceInput, client: ClientInfo): Promise<AuthTokens> {
    const now = Date.now();
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        deviceId: device.id,
        deviceName: device.name ?? null,
        platform: device.platform,
        ip: client.ip,
        userAgent: client.userAgent,
        expiresAt: new Date(now + SESSION_MAX_AGE_DAYS * DAY_MS),
      },
    });
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(
      Math.min(now + REFRESH_TOKEN_TTL_DAYS * DAY_MS, session.expiresAt.getTime()),
    );
    await this.prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });
    return this.tokensFor(userId, session.id, refreshToken, refreshExpiresAt);
  }

  /**
   * Rotates a refresh token. A reused token, a token from another device, an expired or revoked
   * session, or a suspended account all revoke the session and answer SESSION_INVALID.
   */
  async refresh(refreshToken: string, deviceId: string, client: ClientInfo): Promise<AuthTokens> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<RefreshOutcome> => {
      const [row] = await tx.$queryRaw<RefreshRow[]>`
        SELECT rt.id AS token_id, rt.session_id, rt.expires_at AS token_expires_at, rt.used_at,
               s.user_id, s.device_id, s.revoked_at, s.expires_at AS session_expires_at
        FROM refresh_tokens rt JOIN user_sessions s ON s.id = rt.session_id
        WHERE rt.token_hash = ${sha256Hex(refreshToken)}
        FOR UPDATE OF rt, s`;
      if (!row) return { kind: 'rejected', message: 'Unknown refresh token.' };

      const revoke = async (
        reason: SessionRevocationReason,
        message: string,
      ): Promise<RefreshOutcome> => {
        if (!row.revoked_at) {
          await tx.userSession.update({
            where: { id: row.session_id },
            data: { revokedAt: new Date(), revokedReason: reason },
          });
        }
        return { kind: 'rejected', message };
      };

      const now = new Date();
      if (row.revoked_at) return { kind: 'rejected', message: 'Session revoked.' };
      if (row.used_at) return revoke('REFRESH_REUSE', 'Refresh token reused; session revoked.');
      if (row.device_id !== deviceId)
        return revoke('DEVICE_MISMATCH', 'Refresh token used from another device.');
      if (row.token_expires_at <= now || row.session_expires_at <= now) {
        return { kind: 'rejected', message: 'Session expired.' };
      }
      if (!(await this.users.isActive(row.user_id))) {
        return revoke('ACCOUNT_SUSPENDED', 'Account is not active.');
      }

      const next = randomToken();
      const expiresAt = new Date(
        Math.min(now.getTime() + REFRESH_TOKEN_TTL_DAYS * DAY_MS, row.session_expires_at.getTime()),
      );
      await tx.refreshToken.update({ where: { id: row.token_id }, data: { usedAt: now } });
      await tx.refreshToken.create({
        data: { sessionId: row.session_id, tokenHash: sha256Hex(next), expiresAt },
      });
      await tx.userSession.update({
        where: { id: row.session_id },
        data: { lastUsedAt: now, ip: client.ip, userAgent: client.userAgent },
      });
      return {
        kind: 'rotated',
        userId: row.user_id,
        sessionId: row.session_id,
        refreshToken: next,
        expiresAt,
      };
    });

    if (outcome.kind === 'rejected') throw new DomainError('SESSION_INVALID', outcome.message);
    return this.tokensFor(
      outcome.userId,
      outcome.sessionId,
      outcome.refreshToken,
      outcome.expiresAt,
    );
  }

  /** Revokes one of the user's sessions; revoking an unknown or foreign session is a 404. */
  async revoke(userId: string, sessionId: string, reason: SessionRevocationReason): Promise<void> {
    const { count } = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    if (count === 0) throw new DomainError('NOT_FOUND', 'Session not found.');
  }

  async revokeAll(userId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  listActive(userId: string): Promise<SessionView[]> {
    return this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, deviceName: true, platform: true, createdAt: true, lastUsedAt: true },
    });
  }

  /** Removes expired refresh tokens and long-ended sessions (hourly maintenance job). */
  async purge(): Promise<void> {
    const now = new Date();
    const retention = new Date(now.getTime() - SESSION_RETENTION_DAYS * DAY_MS);
    await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.userSession.deleteMany({
      where: { OR: [{ revokedAt: { lt: retention } }, { expiresAt: { lt: retention } }] },
    });
  }

  private async tokensFor(
    userId: string,
    sessionId: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<AuthTokens> {
    const access = await this.tokens.issue({ userId, sessionId });
    return {
      sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}
