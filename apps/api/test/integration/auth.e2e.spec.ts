// End-to-end user authentication (ADR-009) against the real app and database.
import { describe, expect, it } from 'vitest';
import { TEST_TERMS_VERSION } from '../support/env.js';
import { uniqueEmail, useTestApp } from './app.js';

const app = useTestApp();
const PASSWORD = 'correct horse battery';
const device = (id = 'device-aaaa-0001') => ({ id, name: 'Test phone', platform: 'ANDROID' });

const signUpBody = (identifier: string, overrides: Record<string, unknown> = {}) => ({
  identifier,
  password: PASSWORD,
  firstName: 'Amina',
  lastName: 'Test',
  wilayaCode: 16,
  acceptTerms: true,
  termsVersion: TEST_TERMS_VERSION,
  ...overrides,
});

async function signUp(identifier: string) {
  const response = await app
    .http()
    .post('/v1/auth/sign-up')
    .send(signUpBody(identifier))
    .expect(202);
  return response.body as {
    challengeId: string;
    destinationHint: string;
    resendAvailableAt: string;
  };
}

/** Signs up, confirms and returns the tokens. */
async function registeredUser(identifier = uniqueEmail('user'), deviceId = 'device-aaaa-0001') {
  const { challengeId } = await signUp(identifier);
  const response = await app
    .http()
    .post('/v1/auth/sign-up/confirm')
    .send({ challengeId, code: app.lastCode(identifier), device: device(deviceId) })
    .expect(200);
  return { identifier, tokens: response.body as Record<string, string> };
}

const signIn = (identifier: string, password = PASSWORD, deviceId = 'device-aaaa-0001') =>
  app
    .http()
    .post('/v1/auth/sign-in')
    .send({ identifier, password, device: device(deviceId) });

describe('sign-up and confirmation', () => {
  it('creates an account, confirms it with the code and signs the device in', async () => {
    const identifier = uniqueEmail('amina');
    const challenge = await signUp(identifier);
    expect(challenge.destinationHint).toMatch(/^a•••@test\.doktool\.dz$/);

    const wrong = await app
      .http()
      .post('/v1/auth/sign-up/confirm')
      .send({ challengeId: challenge.challengeId, code: '000000', device: device() });
    if (app.lastCode(identifier) !== '000000') {
      expect(wrong.status).toBe(422);
      expect(wrong.body.error).toMatchObject({
        code: 'OTP_INVALID',
        details: { attemptsRemaining: 2 },
      });
    }

    const confirmed = await app
      .http()
      .post('/v1/auth/sign-up/confirm')
      .send({
        challengeId: challenge.challengeId,
        code: app.lastCode(identifier),
        device: device(),
      })
      .expect(200);
    expect(confirmed.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      sessionId: expect.any(String),
    });

    const me = await app
      .http()
      .get('/v1/me')
      .set('Authorization', `Bearer ${confirmed.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      email: identifier,
      emailConfirmed: true,
      phoneConfirmed: false,
      wilaya: { code: 16, name: 'Alger' },
      professionalProfile: null,
      preferences: { language: 'FR', theme: 'SYSTEM' },
    });
  });

  it('refuses a confirmed identifier and restarts an unconfirmed one', async () => {
    const { identifier } = await registeredUser();
    const again = await app
      .http()
      .post('/v1/auth/sign-up')
      .send(signUpBody(identifier))
      .expect(409);
    expect(again.body.error.code).toBe('ACCOUNT_EXISTS');

    const pending = uniqueEmail('pending');
    const first = await signUp(pending);
    const second = await signUp(pending);
    expect(second.challengeId).not.toBe(first.challengeId);
    expect(await app.prisma().user.count({ where: { email: pending } })).toBe(1);
  });

  it('normalises Algerian mobile numbers', async () => {
    const local = `05${String(Date.now()).slice(-8)}`;
    const challenge = await signUp(local);
    const e164 = `+213${local.slice(1)}`;
    expect(challenge.destinationHint).toBe(`${e164.slice(0, 5)}•••••${e164.slice(-2)}`);
    expect(app.messageCount(e164)).toBe(1);
  });

  it('locks the code after three wrong attempts and refuses early resends', async () => {
    const identifier = uniqueEmail('locked');
    const { challengeId } = await signUp(identifier);
    const correct = app.lastCode(identifier);
    const wrong = correct === '111111' ? '222222' : '111111';

    const early = await app.http().post('/v1/auth/codes/resend').send({ challengeId }).expect(429);
    expect(early.body.error).toMatchObject({
      code: 'OTP_RESEND_TOO_SOON',
      details: { retryAt: expect.any(String) },
    });

    for (const remaining of [2, 1]) {
      const response = await app
        .http()
        .post('/v1/auth/sign-up/confirm')
        .send({ challengeId, code: wrong, device: device() })
        .expect(422);
      expect(response.body.error.details.attemptsRemaining).toBe(remaining);
    }
    const locked = await app
      .http()
      .post('/v1/auth/sign-up/confirm')
      .send({ challengeId, code: wrong, device: device() })
      .expect(423);
    expect(locked.body.error.code).toBe('OTP_LOCKED');

    const whileLocked = await app
      .http()
      .post('/v1/auth/sign-up/confirm')
      .send({ challengeId, code: correct, device: device() })
      .expect(423);
    expect(whileLocked.body.error.code).toBe('OTP_LOCKED');
  });

  it('validates the form: terms, wilaya, password and identifier', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ acceptTerms: false }, 'acceptTerms'],
      [{ termsVersion: 'old' }, 'termsVersion'],
      [{ wilayaCode: 99 }, 'wilayaCode'],
      [{ password: 'short' }, 'password'],
      [{ identifier: 'not-an-identifier' }, 'identifier'],
    ];
    for (const [override] of cases) {
      const response = await app
        .http()
        .post('/v1/auth/sign-up')
        .send(signUpBody(uniqueEmail('v'), override));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
    const email = uniqueEmail('same');
    const same = await app
      .http()
      .post('/v1/auth/sign-up')
      .send(signUpBody(email, { password: email }));
    expect(same.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rate-limits sign-ups per IP', async () => {
    for (let i = 0; i < 10; i++) await signUp(uniqueEmail('burst'));
    const limited = await app
      .http()
      .post('/v1/auth/sign-up')
      .send(signUpBody(uniqueEmail('burst')))
      .expect(429);
    expect(limited.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAt: expect.any(String) },
    });
  });
});

describe('sign-in', () => {
  it('signs in with the right password and refuses unknown or unconfirmed identifiers', async () => {
    const { identifier } = await registeredUser();
    await signIn(identifier).expect(200);
    expect((await signIn(uniqueEmail('nobody')).expect(401)).body.error.code).toBe(
      'INVALID_CREDENTIALS',
    );

    const pending = uniqueEmail('unconfirmed');
    await signUp(pending);
    expect((await signIn(pending).expect(403)).body.error.code).toBe('IDENTIFIER_NOT_CONFIRMED');
  });

  it('locks the account after five wrong passwords', async () => {
    const { identifier } = await registeredUser();
    for (let i = 0; i < 4; i++) {
      expect((await signIn(identifier, 'wrong password').expect(401)).body.error.code).toBe(
        'INVALID_CREDENTIALS',
      );
    }
    const locked = await signIn(identifier, 'wrong password').expect(423);
    expect(locked.body.error).toMatchObject({
      code: 'ACCOUNT_LOCKED',
      details: { retryAt: expect.any(String) },
    });
    expect((await signIn(identifier).expect(423)).body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses a suspended account', async () => {
    const { identifier } = await registeredUser();
    await app.prisma().user.update({ where: { email: identifier }, data: { status: 'SUSPENDED' } });
    expect((await signIn(identifier).expect(403)).body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('answers 401 with the error envelope for a bad access token', async () => {
    const response = await app.http().get('/v1/me').set('Authorization', 'Bearer nope').expect(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String), details: {} },
    });
  });
});

describe('refresh tokens and sessions', () => {
  const refresh = (refreshToken: string, deviceId = 'device-aaaa-0001') =>
    app.http().post('/v1/auth/refresh').send({ refreshToken, deviceId });

  it('rotates the refresh token and revokes the session when an old one is replayed', async () => {
    const { tokens } = await registeredUser();
    const rotated = await refresh(tokens.refreshToken!).expect(200);
    expect(rotated.body.refreshToken).not.toBe(tokens.refreshToken);

    expect((await refresh(tokens.refreshToken!).expect(401)).body.error.code).toBe(
      'SESSION_INVALID',
    );
    // The replay revoked the whole session: the newest token is dead too.
    await refresh(rotated.body.refreshToken as string).expect(401);
  });

  it('revokes the session when a refresh token is used from another device', async () => {
    const { tokens } = await registeredUser();
    await refresh(tokens.refreshToken!, 'another-device-99').expect(401);
    await refresh(tokens.refreshToken!).expect(401);
  });

  it('lists sessions, revokes another device and signs out', async () => {
    const { identifier, tokens } = await registeredUser();
    const second = await signIn(identifier, PASSWORD, 'device-bbbb-0002').expect(200);
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };

    const list = await app.http().get('/v1/me/sessions').set(auth).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    await app.http().delete(`/v1/me/sessions/${second.body.sessionId}`).set(auth).expect(204);
    await refresh(second.body.refreshToken as string, 'device-bbbb-0002').expect(401);

    await app.http().post('/v1/auth/sign-out').set(auth).expect(204);
    await refresh(tokens.refreshToken!).expect(401);
  });

  it('cannot revoke another user’s session', async () => {
    const alice = await registeredUser();
    const bob = await registeredUser();
    await app
      .http()
      .delete(`/v1/me/sessions/${bob.tokens.sessionId}`)
      .set({ Authorization: `Bearer ${alice.tokens.accessToken}` })
      .expect(404);
  });
});

describe('password reset', () => {
  it('answers the same way for unknown identifiers and sends nothing', async () => {
    const unknown = uniqueEmail('ghost');
    const response = await app
      .http()
      .post('/v1/auth/password-reset')
      .send({ identifier: unknown })
      .expect(202);
    expect(response.body.challengeId).toEqual(expect.any(String));
    expect(app.messageCount(unknown)).toBe(0);
    const confirm = await app
      .http()
      .post('/v1/auth/password-reset/confirm')
      .send({
        challengeId: response.body.challengeId,
        code: '123456',
        newPassword: 'another password',
      })
      .expect(422);
    expect(confirm.body.error.code).toBe('OTP_INVALID');
  });

  it('sets the new password and signs every device out', async () => {
    const { identifier, tokens } = await registeredUser();
    const { body } = await app
      .http()
      .post('/v1/auth/password-reset')
      .send({ identifier })
      .expect(202);
    await app
      .http()
      .post('/v1/auth/password-reset/confirm')
      .send({
        challengeId: body.challengeId,
        code: app.lastCode(identifier),
        newPassword: 'a brand new secret',
      })
      .expect(204);

    await app
      .http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken, deviceId: 'device-aaaa-0001' })
      .expect(401);
    await signIn(identifier).expect(401);
    await signIn(identifier, 'a brand new secret').expect(200);
  });
});

describe('account', () => {
  it('lists the 58 wilayas publicly', async () => {
    const response = await app.http().get('/v1/wilayas').expect(200);
    expect(response.body).toHaveLength(58);
    expect(response.body[15]).toEqual({ code: 16, name: 'Alger' });
  });

  it('records who the person is once, with year rules per type, and updates preferences', async () => {
    const { tokens } = await registeredUser();
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };
    const bad = await app
      .http()
      .post('/v1/me/professional-profile')
      .set(auth)
      .send({ professionalType: 'RESIDENT', academicYear: 3 })
      .expect(400);
    expect(bad.body.error.details.fields.academicYear).toBeDefined();

    const ok = await app
      .http()
      .post('/v1/me/professional-profile')
      .set(auth)
      .send({ professionalType: 'STUDENT', academicYear: 4 })
      .expect(200);
    expect(ok.body.professionalProfile).toMatchObject({
      professionalType: 'STUDENT',
      academicYear: 4,
    });

    const again = await app
      .http()
      .post('/v1/me/professional-profile')
      .set(auth)
      .send({ professionalType: 'DOCTOR' })
      .expect(409);
    expect(again.body.error.code).toBe('PROFILE_ALREADY_SET');

    const preferences = await app
      .http()
      .patch('/v1/me/preferences')
      .set(auth)
      .send({ language: 'EN', theme: 'DARK' })
      .expect(200);
    expect(preferences.body.preferences).toMatchObject({ language: 'EN', theme: 'DARK' });
  });

  it('does not offer pharmacist or other health professionals (ADR-006 Q7)', async () => {
    const { tokens } = await registeredUser();
    const response = await app
      .http()
      .post('/v1/me/professional-profile')
      .set({ Authorization: `Bearer ${tokens.accessToken}` })
      .send({ professionalType: 'PHARMACIST' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});
