import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../database/prisma.service.js';

export const TOKEN_ISSUER = 'doktool-api';
export const USER_AUDIENCE = 'doktool-user';
/** Access-token lifetime (ADR-009: 15 min). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Who is calling, as proven by a valid user access token. */
export interface UserPrincipal {
  userId: string;
  sessionId: string;
}

/**
 * Signs and verifies user access tokens (HS256, issuer `doktool-api`, audience `doktool-user`).
 * Lives outside the auth module so any module can guard its routes without importing auth.
 *
 * A token is accepted only while its session is live (ADR-023): signing a device out, changing
 * the password, a recovery, a suspension or a deletion take effect on the next request rather
 * than when the 15-minute token expires. This is a read-only, primary-key lookup of the auth
 * module's `user_sessions` — the one place outside auth that reads it (ADR-001 exception).
 */
@Injectable()
export class UserTokens {
  private readonly key: Uint8Array;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.key = new TextEncoder().encode(env.USER_JWT_SECRET);
  }

  async issue(principal: UserPrincipal): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((issuedAt + ACCESS_TOKEN_TTL_SECONDS) * 1000);
    const token = await new SignJWT({ sid: principal.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(TOKEN_ISSUER)
      .setAudience(USER_AUDIENCE)
      .setSubject(principal.userId)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<UserPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: TOKEN_ISSUER,
        audience: USER_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new DomainError('UNAUTHENTICATED', 'Malformed access token.');
      }
      if (!(await this.sessionIsLive(payload.sid, payload.sub))) {
        throw new DomainError('SESSION_INVALID', 'This session has ended.');
      }
      return { userId: payload.sub, sessionId: payload.sid };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (!(error instanceof errors.JOSEError)) throw error;
      const expired = error instanceof errors.JWTExpired;
      throw new DomainError(
        'UNAUTHENTICATED',
        expired ? 'Access token expired.' : 'Invalid access token.',
      );
    }
  }

  private async sessionIsLive(sessionId: string, userId: string): Promise<boolean> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(sessionId) || !uuid.test(userId)) return false;
    const [row] = await this.prisma.$queryRaw<{ live: boolean }[]>`
      SELECT (revoked_at IS NULL AND expires_at > now()) AS live
      FROM user_sessions WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid`;
    return row?.live === true;
  }
}
