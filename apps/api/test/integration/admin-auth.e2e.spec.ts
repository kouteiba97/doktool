// End-to-end admin authentication (ADR-009): password → TOTP at every login → cookie session.
import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';
import { AdminAccountsService } from '../../src/modules/admin-auth/admin-accounts.service.js';
import { GRANTS } from '../../src/modules/admin-auth/grants.js';
import { TEST_ADMIN_ORIGIN } from '../support/env.js';
import { uniqueEmail, useTestApp } from './app.js';

const app = useTestApp();
const PASSWORD = 'admin password for tests';
const COOKIE = '__Host-doktool_admin';

const codeFor = (secretBase32: string, offsetSeconds = 0) =>
  TOTP.generate({
    secret: Secret.fromBase32(secretBase32),
    timestamp: Date.now() + offsetSeconds * 1000,
  });

async function createAdmin(preset: 'SUPER_ADMIN' | 'ANALYST' = 'SUPER_ADMIN') {
  const email = uniqueEmail('admin');
  const { id } = await app
    .get(AdminAccountsService)
    .create({ email, fullName: 'Dr Test Admin', password: PASSWORD, preset, grantedById: null });
  return { id, email };
}

const post = (path: string) => app.http().post(path).set('Origin', TEST_ADMIN_ORIGIN);
const signIn = (email: string, password = PASSWORD) =>
  post('/admin/v1/auth/sign-in').send({ email, password });

function sessionCookie(setCookie: string[] | string | undefined): string {
  const header = ([] as string[]).concat(setCookie ?? []).find((c) => c.startsWith(`${COOKIE}=`));
  if (!header) throw new Error('No admin session cookie was set');
  return header.split(';')[0]!;
}

/** Enrols TOTP at first login and returns the secret and the session cookie. */
async function enrolledAdmin(preset: 'SUPER_ADMIN' | 'ANALYST' = 'SUPER_ADMIN') {
  const admin = await createAdmin(preset);
  const step = await signIn(admin.email).expect(200);
  const secret = step.body.enrollment.secretBase32 as string;
  const totp = await post('/admin/v1/auth/totp')
    .send({ challengeToken: step.body.challengeToken, code: codeFor(secret) })
    .expect(200);
  return { ...admin, secret, cookie: sessionCookie(totp.headers['set-cookie']) };
}

describe('admin trust boundary', () => {
  it('refuses state-changing requests from another origin', async () => {
    const admin = await createAdmin();
    const noOrigin = await app
      .http()
      .post('/admin/v1/auth/sign-in')
      .send({ email: admin.email, password: PASSWORD });
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('refuses user bearer tokens on admin routes', async () => {
    const response = await app
      .http()
      .get('/admin/v1/me')
      .set('Authorization', 'Bearer user-token')
      .expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('admin sign-in', () => {
  it('never opens a session without TOTP; enrols at first login and sets a strict cookie', async () => {
    const admin = await createAdmin();
    const step = await signIn(admin.email).expect(200);
    expect(step.headers['set-cookie']).toBeUndefined();
    expect(step.body).toMatchObject({
      next: 'TOTP_ENROLL',
      enrollment: {
        secretBase32: expect.any(String),
        otpauthUri: expect.stringMatching(/^otpauth:\/\/totp\//),
      },
    });

    const wrong = await post('/admin/v1/auth/totp')
      .send({ challengeToken: step.body.challengeToken, code: '000000' })
      .expect(422);
    expect(wrong.body.error).toMatchObject({
      code: 'TOTP_INVALID',
      details: { attemptsRemaining: 4 },
    });

    const ok = await post('/admin/v1/auth/totp')
      .send({
        challengeToken: step.body.challengeToken,
        code: codeFor(step.body.enrollment.secretBase32),
      })
      .expect(200);
    const setCookie = ([] as string[]).concat(ok.headers['set-cookie'] ?? []).join(';');
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(ok.body).toMatchObject({ email: admin.email, fullName: 'Dr Test Admin' });
    expect(ok.body.grants).toEqual([...GRANTS].sort());

    const me = await app
      .http()
      .get('/admin/v1/me')
      .set('Cookie', sessionCookie(ok.headers['set-cookie']))
      .expect(200);
    expect(me.body.id).toBe(admin.id);
  });

  it('asks for TOTP at every login and refuses a replayed code', async () => {
    const admin = await enrolledAdmin();
    const step = await signIn(admin.email).expect(200);
    expect(step.body).toMatchObject({ next: 'TOTP_VERIFY', enrollment: null });

    // Enrolment consumed the current step; any code from that step or earlier is a replay, even
    // though it is still inside the ±1 step validation window.
    const replay = await post('/admin/v1/auth/totp')
      .send({ challengeToken: step.body.challengeToken, code: codeFor(admin.secret, -30) })
      .expect(422);
    expect(replay.body.error.code).toBe('TOTP_INVALID');

    await post('/admin/v1/auth/totp')
      .send({ challengeToken: step.body.challengeToken, code: codeFor(admin.secret, 30) })
      .expect(200);
  });

  it('locks after five wrong passwords and writes audit entries', async () => {
    const admin = await createAdmin();
    for (let i = 0; i < 4; i++) {
      expect((await signIn(admin.email, 'wrong').expect(401)).body.error.code).toBe(
        'INVALID_CREDENTIALS',
      );
    }
    expect((await signIn(admin.email, 'wrong').expect(423)).body.error.code).toBe('ACCOUNT_LOCKED');
    expect((await signIn(admin.email).expect(423)).body.error.code).toBe('ACCOUNT_LOCKED');

    const actions = await app.prisma().auditLogEntry.findMany({
      where: { actorId: admin.id },
      orderBy: { id: 'asc' },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual([
      ...Array<string>(4).fill('admin.sign_in.password_rejected'),
      'admin.sign_in.locked',
    ]);
  });

  it('locks the account after five wrong codes, whatever the challenge', async () => {
    const admin = await createAdmin();
    const first = await signIn(admin.email).expect(200);
    for (let i = 0; i < 3; i++) {
      await post('/admin/v1/auth/totp')
        .send({ challengeToken: first.body.challengeToken, code: '000000' })
        .expect(422);
    }
    // A correct password opens a new challenge but does not give new guesses.
    const second = await signIn(admin.email).expect(200);
    await post('/admin/v1/auth/totp')
      .send({ challengeToken: second.body.challengeToken, code: '000000' })
      .expect(422);
    const last = await post('/admin/v1/auth/totp')
      .send({ challengeToken: second.body.challengeToken, code: '000000' })
      .expect(423);
    expect(last.body.error.code).toBe('ACCOUNT_LOCKED');
    // Locked: neither the right code nor the right password works until the lock ends.
    const locked = await post('/admin/v1/auth/totp')
      .send({
        challengeToken: first.body.challengeToken,
        code: codeFor(first.body.enrollment.secretBase32),
      })
      .expect(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    await signIn(admin.email).expect(423);
  });
});

describe('admin sessions', () => {
  it('ends after 30 idle minutes', async () => {
    const admin = await enrolledAdmin();
    await app.http().get('/admin/v1/me').set('Cookie', admin.cookie).expect(200);
    await app.prisma().adminSession.updateMany({
      where: { adminId: admin.id },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
    });
    await app.http().get('/admin/v1/me').set('Cookie', admin.cookie).expect(401);
  });

  it('signs out, clears the cookie and audits it', async () => {
    const admin = await enrolledAdmin();
    const out = await post('/admin/v1/auth/sign-out').set('Cookie', admin.cookie).expect(204);
    expect(([] as string[]).concat(out.headers['set-cookie'] ?? []).join(';')).toMatch(
      new RegExp(`${COOKIE}=;`),
    );
    await app.http().get('/admin/v1/me').set('Cookie', admin.cookie).expect(401);

    const actions = (
      await app
        .prisma()
        .auditLogEntry.findMany({ where: { actorId: admin.id }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['admin.totp.enrolled', 'admin.sign_in.succeeded', 'admin.sign_out']),
    );
  });

  it('exposes only the preset grants of a sub-admin', async () => {
    const analyst = await enrolledAdmin('ANALYST');
    const me = await app.http().get('/admin/v1/me').set('Cookie', analyst.cookie).expect(200);
    expect(me.body.grants).toEqual(['analytics.export', 'analytics.read']);
  });
});

describe('admin passwords', () => {
  const NEW_PASSWORD = 'a new passphrase of my own';
  const changePassword = (cookie: string, body: Record<string, unknown>) =>
    post('/admin/v1/auth/password').set('Cookie', cookie).send(body);

  it('lets an admin replace the password they were handed, and ends their other sessions', async () => {
    const admin = await enrolledAdmin();
    // A second device, signed in with the next TOTP step.
    const step = await signIn(admin.email).expect(200);
    const other = await post('/admin/v1/auth/totp')
      .send({ challengeToken: step.body.challengeToken, code: codeFor(admin.secret, 30) })
      .expect(200);
    const otherCookie = sessionCookie(other.headers['set-cookie']);

    await changePassword(admin.cookie, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    }).expect(204);

    await app.http().get('/admin/v1/me').set('Cookie', admin.cookie).expect(200);
    await app.http().get('/admin/v1/me').set('Cookie', otherCookie).expect(401);
    await signIn(admin.email, PASSWORD).expect(401);
    const next = await signIn(admin.email, NEW_PASSWORD).expect(200);
    expect(next.body.next).toBe('TOTP_VERIFY');

    const actions = (
      await app
        .prisma()
        .auditLogEntry.findMany({ where: { actorId: admin.id }, select: { action: true } })
    ).map((entry) => entry.action);
    expect(actions).toContain('admin.password.changed');
  });

  it('needs the current password, a real change and twelve characters', async () => {
    const admin = await enrolledAdmin();
    const wrong = await changePassword(admin.cookie, {
      currentPassword: 'not the password',
      newPassword: NEW_PASSWORD,
    }).expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    await changePassword(admin.cookie, {
      currentPassword: PASSWORD,
      newPassword: 'short one',
    }).expect(400);
    await changePassword(admin.cookie, { currentPassword: PASSWORD, newPassword: PASSWORD }).expect(
      400,
    );
    await changePassword(admin.cookie, {
      currentPassword: PASSWORD,
      newPassword: admin.email,
    }).expect(400);
    // Nothing changed: the old password still opens the TOTP step.
    await signIn(admin.email, PASSWORD).expect(200);
  });

  it('stops guessing the current password from an open console', async () => {
    const admin = await enrolledAdmin();
    for (let attempt = 0; attempt < 5; attempt++) {
      await changePassword(admin.cookie, {
        currentPassword: `guess ${attempt}`,
        newPassword: NEW_PASSWORD,
      }).expect(401);
    }
    const limited = await changePassword(admin.cookie, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    }).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('lets a Super Admin issue a new one-time password to another admin, never to themselves', async () => {
    const superAdmin = await enrolledAdmin();
    const target = await enrolledAdmin('ANALYST');
    const reset = (cookie: string, id: string, body: Record<string, unknown>) =>
      post(`/admin/v1/admins/${id}/reset-password`).set('Cookie', cookie).send(body);

    await reset(target.cookie, superAdmin.id, { reason: 'Mot de passe oublié' }).expect(403);
    await reset(superAdmin.cookie, superAdmin.id, { reason: 'Mot de passe oublié' }).expect(403);
    await reset(superAdmin.cookie, target.id, {}).expect(400);

    const issued = await reset(superAdmin.cookie, target.id, {
      reason: 'Mot de passe oublié',
    }).expect(200);
    expect(issued.body.oneTimePassword).toEqual(expect.stringMatching(/^[\w-]{24}$/));

    // The old password and the old session are gone; the new password still needs TOTP.
    await app.http().get('/admin/v1/me').set('Cookie', target.cookie).expect(401);
    await signIn(target.email, PASSWORD).expect(401);
    const step = await signIn(target.email, issued.body.oneTimePassword as string).expect(200);
    expect(step.body).toMatchObject({ next: 'TOTP_VERIFY', enrollment: null });

    const entry = await app.prisma().auditLogEntry.findFirstOrThrow({
      where: { action: 'admin.password.reset', entityId: target.id },
    });
    expect(entry).toMatchObject({ actorId: superAdmin.id, reason: 'Mot de passe oublié' });
    // The password itself is never written to the audit log.
    expect(JSON.stringify([entry.before, entry.after, entry.reason])).not.toContain(
      issued.body.oneTimePassword,
    );
  });
});
