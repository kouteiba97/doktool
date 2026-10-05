// Dates survive the round trip to the database unchanged, whatever the server's time zone (the
// local cluster runs in Europe/Berlin; a managed one usually in UTC).
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { useTestApp } from './app.js';

const app = useTestApp();

describe('database time', () => {
  it('stores the instant the application sent', async () => {
    const sent = new Date('2026-10-05T07:08:38.155Z');
    const [row] = await app.get(PrismaService).$queryRaw<
      { at: Date }[]
    >`SELECT ${sent}::timestamptz AS at`;
    expect(row?.at.toISOString()).toBe(sent.toISOString());
  });

  it('agrees with the database clock on what « now » is', async () => {
    const key = `time-check-${Date.now()}`;
    await app.prisma().rateLimitCounter.create({ data: { key, hits: 1, expiresAt: new Date() } });
    const [row] = await app.prisma().$queryRaw<{ drift: number }[]>`
      SELECT abs(extract(epoch FROM now() - expires_at))::float8 AS drift
      FROM rate_limit_counters WHERE key = ${key}`;
    expect(row?.drift).toBeLessThan(5);
    await app.prisma().rateLimitCounter.delete({ where: { key } });
  });
});
