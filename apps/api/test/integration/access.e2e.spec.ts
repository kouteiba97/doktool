// End-to-end entitlements (ADR-010): the profile served by GET /v1/me/access, and demo tokens.
import { describe, expect, it } from 'vitest';
import { TEST_TERMS_VERSION } from '../support/env.js';
import { uniqueEmail, useTestApp } from './app.js';

const app = useTestApp();

async function signedInUser() {
  const identifier = uniqueEmail('access');
  const { body } = await app
    .http()
    .post('/v1/auth/sign-up')
    .send({
      identifier,
      password: 'access test password',
      firstName: 'Nour',
      lastName: 'Test',
      wilayaCode: 25,
      acceptTerms: true,
      termsVersion: TEST_TERMS_VERSION,
    })
    .expect(202);
  const tokens = await app
    .http()
    .post('/v1/auth/sign-up/confirm')
    .send({
      challengeId: body.challengeId,
      code: app.lastCode(identifier),
      device: { id: 'device-access-1', platform: 'IOS' },
    })
    .expect(200);
  const user = await app.prisma().user.findUniqueOrThrow({ where: { email: identifier } });
  return { userId: user.id, auth: { Authorization: `Bearer ${tokens.body.accessToken}` } };
}

const accessOf = async (auth: Record<string, string>) =>
  (await app.http().get('/v1/me/access').set(auth).expect(200)).body;

describe('GET /v1/me/access', () => {
  it('follows a student from onboarding to student access', async () => {
    const { userId, auth } = await signedInUser();

    const fresh = await accessOf(auth);
    expect(fresh).toMatchObject({
      accessContext: 'AUTHENTICATED',
      tier: 'RESTRICTED',
      content: {
        calculators: {
          scope: 'NONE',
          lockReason: 'VERIFICATION_REQUIRED',
          unlockPath: 'onboarding.role',
        },
      },
      policyVersion: expect.any(String),
    });

    await app
      .http()
      .post('/v1/me/professional-profile')
      .set(auth)
      .send({ professionalType: 'STUDENT', academicYear: 2 })
      .expect(200);
    expect((await accessOf(auth)).content.calculators.unlockPath).toBe('verification.start');

    await app.prisma().verificationCase.create({
      data: { userId, type: 'STUDENT_STATUS', status: 'SUBMITTED', submittedAt: new Date() },
    });
    const student = await accessOf(auth);
    expect(student.tier).toBe('STUDENT');
    expect(student.content).toEqual({
      calculators: { scope: 'STUDENT_TIER', lockReason: 'PROFESSIONAL_ONLY', unlockPath: null },
      referenceDocuments: {
        scope: 'DEMO_SAMPLE',
        lockReason: 'PROFESSIONAL_ONLY',
        unlockPath: null,
      },
    });
    expect(student.features).toHaveLength(8);
    expect(
      student.features.find((f: { key: string }) => f.key === 'subscription.purchase'),
    ).toMatchObject({
      state: 'LOCKED',
      lockReason: 'PROFESSIONAL_ONLY',
      unlockPath: null,
    });
  });

  it('makes a verified doctor with an active plan PROFESSIONAL', async () => {
    const { userId, auth } = await signedInUser();
    await app
      .http()
      .post('/v1/me/professional-profile')
      .set(auth)
      .send({ professionalType: 'DOCTOR' })
      .expect(200);
    await app.prisma().verificationCase.create({
      data: {
        userId,
        type: 'PROFESSIONAL_STATUS',
        status: 'VERIFIED',
        submittedAt: new Date(),
        decidedAt: new Date(),
      },
    });
    expect((await accessOf(auth)).tier).toBe('PROFESSIONAL_UNPAID');

    const plan = await app.prisma().subscriptionPlan.create({
      data: {
        code: `TEST_${Date.now()}`,
        version: 1,
        audience: ['DOCTOR', 'RESIDENT'],
        nameFr: 'Test',
        nameEn: 'Test',
        priceMinor: 100000,
        durationDays: 30,
        includesFr: [],
        includesEn: [],
        excludesFr: [],
        excludesEn: [],
      },
    });
    await app.prisma().subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const professional = await accessOf(auth);
    expect(professional.tier).toBe('PROFESSIONAL');
    expect(professional.content.referenceDocuments.scope).toBe('ALL');
  });
});

describe('demo sessions', () => {
  const start = (deviceId: string, demoContext = 'DOCTOR') =>
    app.http().post('/v1/demo/sessions').send({ demoContext, deviceId });

  it('starts a demo without any account and serves the DEMO profile', async () => {
    const demo = await start('demo-device-0001').expect(201);
    expect(demo.body).toMatchObject({
      demoSessionId: expect.any(String),
      demoContext: 'DOCTOR',
      accessToken: expect.any(String),
      renewalToken: expect.any(String),
    });
    const profile = await accessOf({ Authorization: `Bearer ${demo.body.accessToken}` });
    expect(profile).toMatchObject({
      accessContext: 'DEMO',
      tier: 'DEMO',
      content: {
        calculators: {
          scope: 'DEMO_SAMPLE',
          lockReason: 'DEMO_LIMIT',
          unlockPath: 'subscription.plans',
        },
      },
    });

    const session = await app
      .prisma()
      .demoSession.findUniqueOrThrow({ where: { id: demo.body.demoSessionId } });
    expect(session.expiresAt).toBeNull();
    expect(session.deviceIdHash).not.toContain('demo-device');
  });

  it('keeps one active session per device and rotates its renewal token', async () => {
    const first = await start('demo-device-0002').expect(201);
    const second = await start('demo-device-0002', 'RESIDENT').expect(201);
    expect(second.body.demoSessionId).toBe(first.body.demoSessionId);
    expect(second.body.demoContext).toBe('RESIDENT');

    await app
      .http()
      .post('/v1/demo/sessions/token')
      .send({ renewalToken: first.body.renewalToken, deviceId: 'demo-device-0002' })
      .expect(401);
    const renewed = await app
      .http()
      .post('/v1/demo/sessions/token')
      .send({ renewalToken: second.body.renewalToken, deviceId: 'demo-device-0002' })
      .expect(200);
    expect(renewed.body.accessToken).toEqual(expect.any(String));
  });

  it('renews only from the same device and only while the session is active', async () => {
    const demo = await start('demo-device-0003').expect(201);
    const renew = (deviceId: string) =>
      app
        .http()
        .post('/v1/demo/sessions/token')
        .send({ renewalToken: demo.body.renewalToken, deviceId });
    await renew('someone-else-device').expect(401);
    await app
      .prisma()
      .demoSession.update({ where: { id: demo.body.demoSessionId }, data: { status: 'EXPIRED' } });
    expect((await renew('demo-device-0003').expect(401)).body.error.code).toBe('SESSION_INVALID');
  });

  it('never lets a demo token reach account routes', async () => {
    const demo = await start('demo-device-0004').expect(201);
    const auth = { Authorization: `Bearer ${demo.body.accessToken}` };
    await app.http().get('/v1/me').set(auth).expect(401);
    await app.http().get('/v1/me/sessions').set(auth).expect(401);
    await app.http().patch('/v1/me/preferences').set(auth).send({ language: 'EN' }).expect(401);
  });
});
