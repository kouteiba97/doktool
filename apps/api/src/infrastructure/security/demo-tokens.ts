import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';
import type { DemoContext } from '../../generated/prisma/enums.js';
import { TOKEN_ISSUER } from './user-tokens.js';

export const DEMO_AUDIENCE = 'doktool-demo';
/** Demo access-token lifetime (ADR-010: 1 hour, renewed with the renewal token). */
export const DEMO_TOKEN_TTL_SECONDS = 60 * 60;

/** Who a demo token stands for: a demo session (no user account) and the profession it previews. */
export interface DemoPrincipal {
  demoSessionId: string;
  demoContext: DemoContext;
}

const DEMO_CONTEXTS: readonly string[] = ['DOCTOR', 'RESIDENT'];

/**
 * Demo access tokens: same issuer and key as user tokens but audience `doktool-demo`, so a demo
 * token can never pass {@link UserTokens.verify} (and the reverse).
 */
@Injectable()
export class DemoTokens {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.USER_JWT_SECRET);
  }

  /** Signs a one-hour demo access token for a demo session. */
  async issue(principal: DemoPrincipal): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((issuedAt + DEMO_TOKEN_TTL_SECONDS) * 1000);
    const token = await new SignJWT({ ctx: principal.demoContext })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(TOKEN_ISSUER)
      .setAudience(DEMO_AUDIENCE)
      .setSubject(principal.demoSessionId)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  /**
   * Checks the signature, issuer, audience and expiry of a demo token and returns its session;
   * throws UNAUTHENTICATED otherwise.
   */
  async verify(token: string): Promise<DemoPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: TOKEN_ISSUER,
        audience: DEMO_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || !DEMO_CONTEXTS.includes(String(payload.ctx))) {
        throw new DomainError('UNAUTHENTICATED', 'Malformed demo token.');
      }
      return { demoSessionId: payload.sub, demoContext: payload.ctx as DemoContext };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'UNAUTHENTICATED',
        error instanceof errors.JWTExpired ? 'Demo token expired.' : 'Invalid demo token.',
      );
    }
  }
}
