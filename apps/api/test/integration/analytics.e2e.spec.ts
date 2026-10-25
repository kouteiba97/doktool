// Phase 17 exit criterion (analytics): the app sends events without free text, the server adds a
// pseudonymous envelope, admins read aggregates only, and small cohorts are shown as « < 10 ».
import { randomInt, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service.js';
import { TEST_TERMS_VERSION } from '../support/env.js';
import { type AdminActor, adminActor, demoActor, userActor } from './actors.js';
import { uniqueEmail, useTestApp } from './app.js';

const app = useTestApp();
let analyst: AdminActor;

/** A month of a past year no other test writes to (aggregates are read over that window). */
const year = 1981 + randomInt(0, 17);
const window = { from: new Date(Date.UTC(year, 5, 1)), to: new Date(Date.UTC(year, 6, 1)) };
const query = `from=${window.from.toISOString()}&to=${window.to.toISOString()}`;

beforeAll(async () => {
  analyst = await adminActor(app, 'ANALYST');
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe('ingestion', () => {
  it('stores counts and codes under a server-made pseudonymous envelope', async () => {
    const { userId, auth } = await userActor(app, 'STUDENT');
    const calculatorId = randomUUID();
    const response = await app
      .http()
      .post('/v1/analytics/events')
      .set(auth)
      .send({
        platform: 'ANDROID',
        appVersion: '1.0.0+1',
        dataVersion: '2026-09-26T10:00:00Z',
        events: [
          {
            type: 'CALCULATOR_COMPLETED',
            occurredAt: minutesAgo(5),
            entityId: calculatorId,
            properties: { version: 2, resultBand: 'NORMAL', engine: 'dart-1.0.0' },
          },
          {
            type: 'SEARCH_PERFORMED',
            occurredAt: minutesAgo(4),
            properties: { resultCount: 3, groups: ['CALCULATOR'] },
          },
          // Refused: free text, a missing entity, too old, and a demo-only event.
          {
            type: 'SEARCH_PERFORMED',
            occurredAt: minutesAgo(3),
            properties: { resultCount: 0, groups: [], query: 'angine' },
          },
          {
            type: 'REFERENCE_OPENED',
            occurredAt: minutesAgo(3),
            properties: { referenceType: 'ORDONNANCE' },
          },
          {
            type: 'SUBSCRIPTION_VIEWED',
            occurredAt: '2020-01-01T00:00:00Z',
            properties: { screen: 'plans' },
          },
          {
            type: 'DEMO_STARTED',
            occurredAt: minutesAgo(2),
            properties: { demoContext: 'DOCTOR' },
          },
        ],
      })
      .expect(200);
    expect(response.body).toEqual({
      accepted: 2,
      rejected: { PROPERTIES: 1, ENTITY: 1, TIME: 1, CONTEXT: 1 },
    });

    const stored = await app.prisma().analyticsEvent.findFirstOrThrow({
      where: { entityId: calculatorId },
    });
    expect(stored).toMatchObject({
      type: 'CALCULATOR_COMPLETED',
      accessContext: 'AUTHENTICATED',
      professionalType: 'STUDENT',
      entitlementTier: 'STUDENT',
      wilayaCode: 16,
      entityType: 'CALCULATOR',
      calculatorVersion: 2,
      resultBand: 'NORMAL',
      platform: 'ANDROID',
    });
    expect(stored.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.subjectHash).not.toContain(userId);
    expect(JSON.stringify(stored.properties)).not.toContain('angine');
  });

  it('takes demo events from a demo session only, and needs a token', async () => {
    const demo = await demoActor(app);
    await app
      .http()
      .post('/v1/analytics/events')
      .set(demo.auth)
      .send({
        platform: 'IOS',
        events: [
          {
            type: 'DEMO_FEATURE_VIEWED',
            occurredAt: minutesAgo(1),
            properties: { module: 'calculator', locked: true },
          },
        ],
      })
      .expect(200)
      .expect(({ body }) => expect(body.accepted).toBe(1));
    await app.http().post('/v1/analytics/events').send({ platform: 'IOS', events: [] }).expect(401);
  });

  it('counts a demo that became an account on the same device', async () => {
    const deviceId = `device-${randomUUID()}`;
    const demo = await app
      .http()
      .post('/v1/demo/sessions')
      .send({ demoContext: 'RESIDENT', deviceId })
      .expect(201);
    const identifier = uniqueEmail('converted');
    const signUp = await app
      .http()
      .post('/v1/auth/sign-up')
      .send({
        identifier,
        password: 'user password for tests',
        firstName: 'Test',
        lastName: 'Demo',
        wilayaCode: 16,
        acceptTerms: true,
        termsVersion: TEST_TERMS_VERSION,
      })
      .expect(202);
    await app
      .http()
      .post('/v1/auth/sign-up/confirm')
      .send({
        challengeId: signUp.body.challengeId,
        code: app.lastCode(identifier),
        device: { id: deviceId, platform: 'IOS' },
      })
      .expect(200);
    const session = await app
      .prisma()
      .demoSession.findUniqueOrThrow({ where: { id: demo.body.demoSessionId } });
    const user = await app.prisma().user.findUniqueOrThrow({ where: { email: identifier } });
    expect(session).toMatchObject({ status: 'CONVERTED', convertedUserId: user.id });
  });

  it('records subscriptions published by billing as server events', async () => {
    const { userId } = await userActor(app, 'PROFESSIONAL');
    await app.get(AnalyticsService).recordServerEvent({
      type: 'SUBSCRIPTION_STARTED',
      userId,
      occurredAt: new Date().toISOString(),
      planCode: 'PRO_MONTHLY',
      planVersion: 1,
    });
    const events = await app.prisma().analyticsEvent.findMany({
      where: { type: 'SUBSCRIPTION_STARTED', platform: 'SERVER' },
      orderBy: { id: 'desc' },
      take: 1,
    });
    expect(events[0]).toMatchObject({
      entitlementTier: 'PROFESSIONAL',
      properties: { planCode: 'PRO_MONTHLY', planVersion: 1 },
    });
  });
});

describe('dashboards', () => {
  /** Events of `people` distinct pseudonymous subjects on one model, inside the window. */
  async function seedModelActivity(entityId: string, people: number) {
    await app.prisma().analyticsEvent.createMany({
      data: Array.from({ length: people }, (_, index) => ({
        type: 'REFERENCE_VIEWED' as const,
        occurredAt: new Date(window.from.getTime() + (index + 1) * 3_600_000),
        subjectHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        accessContext: 'AUTHENTICATED' as const,
        professionalType: 'DOCTOR' as const,
        entitlementTier: 'PROFESSIONAL' as const,
        platform: 'ANDROID' as const,
        entityType: 'REFERENCE_DOCUMENT',
        entityId,
        properties: { fileVersion: 1, source: index % 2 === 0 ? 'online' : 'offline' },
      })),
    });
  }

  it('shows aggregates from 10 people and « < 10 » below', async () => {
    const popular = randomUUID();
    const rare = randomUUID();
    await seedModelActivity(popular, 12);
    await seedModelActivity(rare, 3);
    const library = await analyst.get(`/admin/v1/analytics/library?${query}`).expect(200);
    const row = (id: string) =>
      library.body.models.find((model: { id: string }) => model.id === id);
    expect(row(popular)).toMatchObject({ views: 12, offlineViews: 6, opens: 0 });
    expect(row(rare)).toMatchObject({ views: null, offlineViews: null });

    const usage = await analyst
      .get(`/admin/v1/analytics/usage?${query}&professionalType=DOCTOR`)
      .expect(200);
    expect(usage.body.activeSubjects).toBeGreaterThanOrEqual(15);
    expect(
      usage.body.byType.find(
        (item: { professionalType: string }) => item.professionalType === 'STUDENT',
      ).subjects,
    ).toBeNull();

    for (const dashboard of ['calculators', 'users', 'subscriptions', 'demo']) {
      await analyst.get(`/admin/v1/analytics/${dashboard}?${query}`).expect(200);
    }
    await analyst.get('/admin/v1/analytics/freshness').expect(200);
  });

  it('keeps analytics behind its grant and within a bounded period', async () => {
    const reviewer = await adminActor(app, 'VERIFICATION_REVIEWER');
    await reviewer.get(`/admin/v1/analytics/usage?${query}`).expect(403);
    await analyst
      .get(`/admin/v1/analytics/usage?from=1990-01-01T00:00:00Z&to=1992-01-01T00:00:00Z`)
      .expect(400);
  });
});
