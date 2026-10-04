// Phase 17: the Admin Web read models (overview, users, audit log) and the permissions screen.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_ADMIN_ORIGIN } from '../support/env.js';
import { type AdminActor, adminActor, userActor } from './actors.js';
import { uniqueEmail, useTestApp } from './app.js';

const app = useTestApp();
let superAdmin: AdminActor;

beforeAll(async () => {
  superAdmin = await adminActor(app);
});

describe('users', () => {
  it('finds a person, explains their access and shows counts, never content or secrets', async () => {
    const { userId } = await userActor(app, 'PROFESSIONAL');
    const lastName = `Zeroual${randomUUID().slice(0, 8)}`;
    await app.prisma().user.update({ where: { id: userId }, data: { lastName } });
    const found = await superAdmin.get(`/admin/v1/users?search=${lastName}`).expect(200);
    expect(found.body).toHaveLength(1);
    expect(found.body[0]).toMatchObject({
      id: userId,
      professionalType: 'DOCTOR',
      verification: { status: 'VERIFIED' },
      subscription: 'ACTIVE',
    });

    const detail = await superAdmin.get(`/admin/v1/users/${userId}`).expect(200);
    expect(detail.body.access.tier).toBe('PROFESSIONAL');
    expect(detail.body.accessInputs).toMatchObject({
      accountStatus: 'ACTIVE',
      subscriptionStatus: 'ACTIVE',
    });
    expect(detail.body.activity).toEqual({ favorites: [], history: [] });
    expect(detail.body.subscriptions).toHaveLength(1);
    expect(JSON.stringify(detail.body)).not.toMatch(/password|tokenHash/i);
  });

  it('suspends with a reason: sessions end and access is restricted; reinstating restores it', async () => {
    const { userId, auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    const reviewer = await adminActor(app, 'VERIFICATION_REVIEWER');
    await reviewer
      .post(`/admin/v1/users/${userId}/suspend`)
      .send({ reason: 'Fraud report' })
      .expect(403);
    await superAdmin
      .post(`/admin/v1/users/${userId}/suspend`)
      .send({ reason: 'Fraud report' })
      .expect(204);
    const sessions = await app.prisma().userSession.findMany({ where: { userId } });
    expect(sessions.every((session) => session.revokedReason === 'ACCOUNT_SUSPENDED')).toBe(true);
    // The session ends on the next request, not when the access token expires (ADR-023).
    expect((await app.http().get('/v1/me/access').set(auth).expect(401)).body.error.code).toBe(
      'SESSION_INVALID',
    );
    await superAdmin
      .post(`/admin/v1/users/${userId}/suspend`)
      .send({ reason: 'Again' })
      .expect(409);

    await superAdmin
      .post(`/admin/v1/users/${userId}/reinstate`)
      .send({ reason: 'Report was false' })
      .expect(204);
    const detail = await superAdmin.get(`/admin/v1/users/${userId}`).expect(200);
    expect(detail.body.status).toBe('ACTIVE');
    expect(detail.body.history.map((entry: { action: string }) => entry.action)).toEqual([
      'user.reinstated',
      'user.suspended',
    ]);
  });

  it('signs a person out of every device', async () => {
    const { userId } = await userActor(app, 'STUDENT');
    await superAdmin
      .post(`/admin/v1/users/${userId}/sign-out`)
      .send({ reason: 'Lost phone' })
      .expect(204);
    const sessions = await app.prisma().userSession.findMany({ where: { userId } });
    expect(sessions.every((session) => session.revokedReason === 'ADMIN_REVOKED')).toBe(true);
  });
});

describe('audit log', () => {
  it('filters by entity and action prefix, and exports only with audit.export', async () => {
    const { userId } = await userActor(app, 'STUDENT');
    await superAdmin
      .post(`/admin/v1/users/${userId}/sign-out`)
      .send({ reason: 'Support request' })
      .expect(204);
    const entries = await superAdmin
      .get(`/admin/v1/audit?entityType=User&entityId=${userId}&action=user.`)
      .expect(200);
    expect(entries.body).toEqual([
      expect.objectContaining({
        action: 'user.sessions_revoked',
        actorId: superAdmin.id,
        actorName: 'Test SUPER_ADMIN',
        reason: 'Support request',
      }),
    ]);

    const exported = await superAdmin
      .get(`/admin/v1/audit/export?entityType=User&entityId=${userId}`)
      .expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.text).toContain('user.sessions_revoked');
    const exports = await superAdmin
      .get(`/admin/v1/audit?action=audit.exported&actorId=${superAdmin.id}`)
      .expect(200);
    expect(exports.body.length).toBeGreaterThan(0);

    const financeAdmin = await adminActor(app, 'FINANCE_ADMIN');
    await financeAdmin.get('/admin/v1/audit').expect(403);
  });
});

describe('overview', () => {
  it('shows each block only to the grants that cover it', async () => {
    const all = await superAdmin.get('/admin/v1/overview').expect(200);
    expect(all.body).toMatchObject({ slaHours: 24 });
    for (const key of [
      'pendingVerifications',
      'payingProfessionals',
      'netRevenue30dMinor',
      'versionsToReview',
      'fileFailures',
    ]) {
      expect(all.body).toHaveProperty(key);
    }
    const librarian = await adminActor(app, 'LIBRARY_MANAGER');
    const partial = await librarian.get('/admin/v1/overview').expect(200);
    expect(partial.body).toHaveProperty('fileFailures');
    expect(partial.body).not.toHaveProperty('netRevenue30dMinor');
    expect(partial.body).not.toHaveProperty('pendingVerifications');
  });
});

describe('permissions', () => {
  it('creates an admin with a one-time password who enrols TOTP at first sign-in', async () => {
    const email = uniqueEmail('new-admin');
    const created = await superAdmin
      .post('/admin/v1/admins')
      .send({
        email,
        fullName: 'Dr Nouvel Admin',
        preset: 'LIBRARY_MANAGER',
        reason: 'New library manager',
      })
      .expect(200);
    const step = await app
      .http()
      .post('/admin/v1/auth/sign-in')
      .set('Origin', TEST_ADMIN_ORIGIN)
      .send({ email, password: created.body.oneTimePassword })
      .expect(200);
    expect(step.body.next).toBe('TOTP_ENROLL');

    const admins = await superAdmin.get('/admin/v1/admins').expect(200);
    const listed = admins.body.find((admin: { id: string }) => admin.id === created.body.id);
    expect(listed).toMatchObject({
      preset: 'LIBRARY_MANAGER',
      totpEnrolled: false,
      status: 'ACTIVE',
    });
  });

  it('enforces separation of duties, never self-edits, and grants documents access for hours', async () => {
    const reviewer = await adminActor(app, 'VERIFICATION_REVIEWER');
    const mixed = await superAdmin
      .put(`/admin/v1/admins/${reviewer.id}/grants`)
      .send({ grants: ['finance.read', 'library.write'], reason: 'Mixed duties' })
      .expect(400);
    expect(mixed.body.error.code).toBe('VALIDATION_FAILED');
    await superAdmin
      .put(`/admin/v1/admins/${superAdmin.id}/grants`)
      .send({ grants: ['audit.read'], reason: 'Self edit' })
      .expect(403);

    const temporary = await superAdmin
      .post(`/admin/v1/admins/${reviewer.id}/temporary-grants`)
      .send({ grant: 'verification.documents.view', reason: 'Case backlog' })
      .expect(200);
    const hours = (new Date(temporary.body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThanOrEqual(2);
    const me = await reviewer.get('/admin/v1/me').expect(200);
    expect(me.body.grants).toContain('verification.documents.view');

    await superAdmin
      .put(`/admin/v1/admins/${reviewer.id}/grants`)
      .send({
        grants: ['verification.queue.read', 'verification.review', 'audit.read'],
        reason: 'Audit duty',
      })
      .expect(204);
    const after = await reviewer.get('/admin/v1/me').expect(200);
    expect(after.body.grants).toEqual(
      expect.arrayContaining(['audit.read', 'verification.documents.view', 'verification.review']),
    );
  });

  it('suspends an admin (sessions end) and resets TOTP so the next sign-in enrols again', async () => {
    const target = await adminActor(app, 'ANALYST');
    await superAdmin
      .post(`/admin/v1/admins/${target.id}/suspend`)
      .send({ reason: 'Left the team' })
      .expect(204);
    await target.get('/admin/v1/me').expect(401);
    await superAdmin
      .post(`/admin/v1/admins/${target.id}/reinstate`)
      .send({ reason: 'Back' })
      .expect(204);
    await superAdmin
      .post(`/admin/v1/admins/${target.id}/reset-totp`)
      .send({ reason: 'Lost phone' })
      .expect(204);
    const account = await app.prisma().adminAccount.findUniqueOrThrow({ where: { id: target.id } });
    expect(account.totpSecretEncrypted).toBeNull();
    const analyst = await adminActor(app, 'ANALYST');
    await analyst.get('/admin/v1/admins').expect(403);
  });
});
