import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { sha256Hex } from '../crypto/tokens.js';
import { PrismaService } from '../database/prisma.service.js';

/** A limit: at most `limit` hits per `windowSeconds` for one subject. */
export interface RateLimitRule {
  /** Stable rule name, part of the counter key. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Fixed-window rate limiter on PostgreSQL (ADR-007, ADR-009): one row per key, updated with one
 * atomic upsert, so the limit holds across API instances. Subjects (IPs, identifiers) are hashed
 * before they are stored.
 */
@Injectable()
export class RateLimiter {
  constructor(private readonly prisma: PrismaService) {}

  /** Records one hit for `subject`; throws RATE_LIMITED once the window's limit is exceeded. */
  async hit(rule: RateLimitRule, subject: string): Promise<void> {
    const key = `${rule.name}:${sha256Hex(subject).slice(0, 40)}`;
    const [row] = await this.prisma.$queryRaw<{ hits: number; expires_at: Date }[]>`
      INSERT INTO rate_limit_counters (key, hits, expires_at)
      VALUES (${key}, 1, now() + make_interval(secs => ${rule.windowSeconds}))
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limit_counters.expires_at <= now() THEN 1
                    ELSE rate_limit_counters.hits + 1 END,
        expires_at = CASE WHEN rate_limit_counters.expires_at <= now() THEN EXCLUDED.expires_at
                          ELSE rate_limit_counters.expires_at END
      RETURNING hits, expires_at`;
    if (row && row.hits > rule.limit) {
      throw new DomainError('RATE_LIMITED', `Too many requests (${rule.name}).`, {
        retryAt: row.expires_at.toISOString(),
      });
    }
  }

  /** Deletes expired counters (hourly maintenance job). */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.rateLimitCounter.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  }
}
