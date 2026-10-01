// Phase 18: « Supprimer le compte » (section 08) — the person's data is erased module by module,
// the ledger and past decisions stay against an anonymous tombstone, the identifier is free again.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { userActor } from './actors.js';
import { useTestApp } from './app.js';
import { TEST_TERMS_VERSION } from '../support/env.js';

const app = useTestApp();
const PASSWORD = 'user password for tests';

describe('account deletion', () => {
  it('needs the password, and counts nothing on a wrong one', async () => {
    const { userId, auth } = await userActor(app, 'STUDENT');
    const refused = await app
      .http()
      .post('/v1/me/deletion')
      .set(auth)
      .send({ password: 'not the password' })
      .expect(400);
    expect(refused.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { password: ['Wrong password.'] } },
    });
    await app.http().post('/v1/me/deletion').send({ password: PASSWORD }).expect(401);
    const user = await app.prisma().user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.status).toBe('ACTIVE');
  });

  it('erases the person and keeps an anonymous tombstone for the ledger', async () => {
    const { userId, auth } = await userActor(app, 'PROFESSIONAL');
    const prisma = app.prisma();
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // Something in every module that holds personal data.
    const decided = await prisma.verificationCase.findFirstOrThrow({ where: { userId } });
    await prisma.verificationCase.update({
      where: { id: decided.id },
      data: { declaredDetails: { institution: 'CHU Mustapha' } },
    });
    const pending = await prisma.verificationCase.create({
      data: { userId, type: 'IDENTITY', status: 'SUBMITTED', submittedAt: new Date() },
    });
    await prisma.verificationDocument.create({
      data: {
        caseId: pending.id,
        stepType: 'ID_FRONT',
        storageKey: `doktool/verification/${userId}/${randomUUID()}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1200,
        sha256: 'a'.repeat(64),
      },
    });
    await prisma.notification.create({
      data: {
        userId,
        type: 'VERIFICATION',
        messageKey: 'mobile.notifications.subscriptionActivated',
        params: {},
      },
    });
    await prisma.recentActivity.create({
      data: {
        userId,
        kind: 'SEARCH',
        queryText: 'amoxicilline',
        occurredAt: new Date(),
        deviceId: 'device-test',
      },
    });

    const deleted = await app.http().post('/v1/me/deletion').set(auth).send({ password: PASSWORD });
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);

    const tombstone = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(tombstone).toMatchObject({
      status: 'DELETED',
      email: null,
      phone: null,
      firstName: '',
      lastName: '',
      bio: null,
      avatarStorageKey: null,
    });
    expect(await prisma.professionalProfile.count({ where: { userId } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId } })).toBe(0);
    expect(await prisma.recentActivity.count({ where: { userId } })).toBe(0);
    expect(await prisma.verificationCase.count({ where: { id: pending.id } })).toBe(0);
    expect(await prisma.verificationDocument.count({ where: { caseId: pending.id } })).toBe(0);
    const kept = await prisma.verificationCase.findUniqueOrThrow({ where: { id: decided.id } });
    expect(kept.status).toBe('VERIFIED');
    expect(kept.declaredDetails).toEqual({});
    const subscriptions = await prisma.subscription.findMany({ where: { userId } });
    expect(subscriptions.map((subscription) => subscription.status)).toEqual(['EXPIRED']);
    const sessions = await prisma.userSession.findMany({ where: { userId } });
    expect(sessions.every((session) => session.revokedReason === 'ACCOUNT_DELETED')).toBe(true);

    const audit = await prisma.auditLogEntry.findFirstOrThrow({
      where: { action: 'user.account_deleted', entityId: userId },
    });
    expect(audit).toMatchObject({ actorType: 'USER', actorId: userId });

    // The old identifier no longer signs in, and is free for a new account.
    const signIn = await app
      .http()
      .post('/v1/auth/sign-in')
      .send({
        identifier: email,
        password: PASSWORD,
        device: { id: `device-${randomUUID()}`, platform: 'ANDROID' },
      })
      .expect(401);
    expect(signIn.body.error.code).toBe('INVALID_CREDENTIALS');
    await app
      .http()
      .post('/v1/auth/sign-up')
      .send({
        identifier: email,
        password: 'a new password for tests',
        firstName: 'Nouveau',
        lastName: 'Compte',
        wilayaCode: 16,
        acceptTerms: true,
        termsVersion: TEST_TERMS_VERSION,
      })
      .expect(202);

    // A second request finds no account.
    await app.http().post('/v1/me/deletion').set(auth).send({ password: PASSWORD }).expect(401);
  });
});
