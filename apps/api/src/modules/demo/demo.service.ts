import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { DemoContext } from '../../generated/prisma/client.js';
import { randomToken, sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { RateLimitRule } from '../../infrastructure/rate-limit/rate-limiter.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import { DemoTokens } from '../../infrastructure/security/demo-tokens.js';

const RATE_LIMITS = {
  startPerIp: { name: 'demo-start:ip', limit: 20, windowSeconds: 3600 },
  renewPerIp: { name: 'demo-renew:ip', limit: 120, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export interface DemoSessionGrant {
  demoSessionId: string;
  demoContext: DemoContext;
  accessToken: string;
  accessTokenExpiresAt: Date;
  renewalToken: string;
}

const clientKey = (client: ClientInfo) => client.ip ?? 'unknown';

/**
 * Demo sessions (Lock L37, ADR-006 Q5, ADR-010): no account, no contact data, no time limit.
 * A device keeps one active session; nothing a demo does is written to user tables.
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: DemoTokens,
    private readonly limiter: RateLimiter,
  ) {}

  async start(
    demoContext: DemoContext,
    deviceId: string,
    client: ClientInfo,
  ): Promise<DemoSessionGrant> {
    await this.limiter.hit(RATE_LIMITS.startPerIp, clientKey(client));
    const deviceIdHash = sha256Hex(deviceId);
    const renewalToken = randomToken();
    const now = new Date();
    const existing = await this.prisma.demoSession.findFirst({
      where: { deviceIdHash, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    const session = existing
      ? await this.prisma.demoSession.update({
          where: { id: existing.id },
          data: { demoContext, renewalTokenHash: sha256Hex(renewalToken), lastSeenAt: now },
        })
      : await this.prisma.demoSession.create({
          data: { deviceIdHash, demoContext, renewalTokenHash: sha256Hex(renewalToken) },
        });
    const access = await this.tokens.issue({ demoSessionId: session.id, demoContext });
    return {
      demoSessionId: session.id,
      demoContext,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      renewalToken,
    };
  }

  async renew(
    renewalToken: string,
    deviceId: string,
    client: ClientInfo,
  ): Promise<{ accessToken: string; accessTokenExpiresAt: Date }> {
    await this.limiter.hit(RATE_LIMITS.renewPerIp, clientKey(client));
    const now = new Date();
    const session = await this.prisma.demoSession.findUnique({
      where: { renewalTokenHash: sha256Hex(renewalToken) },
    });
    if (
      !session ||
      session.status !== 'ACTIVE' ||
      session.deviceIdHash !== sha256Hex(deviceId) ||
      (session.expiresAt !== null && session.expiresAt <= now)
    ) {
      throw new DomainError(
        'SESSION_INVALID',
        'This demo has ended. Start a new one or create an account.',
      );
    }
    await this.prisma.demoSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    const access = await this.tokens.issue({
      demoSessionId: session.id,
      demoContext: session.demoContext,
    });
    return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt };
  }

  /** Demo sessions started in [from, to), and how many of them became accounts. */
  async stats(from: Date, to: Date): Promise<{ started: number; converted: number }> {
    const [started, converted] = await Promise.all([
      this.prisma.demoSession.count({ where: { startedAt: { gte: from, lt: to } } }),
      this.prisma.demoSession.count({
        where: { startedAt: { gte: from, lt: to }, convertedUserId: { not: null } },
      }),
    ]);
    return { started, converted };
  }
}
