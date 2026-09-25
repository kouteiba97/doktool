// Phase 9 (backend): a doctor, a resident and a student each get verified; reviewers decide with an
// audit trail; appeals go to another reviewer; files are private, viewed briefly and purged.
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { VerificationMaintenanceService } from '../../src/modules/verification/verification-maintenance.service.js';
import { StorageService } from '../../src/modules/storage/storage.service.js';
import { TEST_TERMS_VERSION } from '../support/env.js';
import { type AdminActor, adminActor, demoActor, userActor } from './actors.js';
import { type TestApp, uniqueEmail, useTestApp } from './app.js';

const app = useTestApp();
let superAdmin: AdminActor;
let otherSuperAdmin: AdminActor;
let specialtyId: string;
let institutionId: string;
let universityId: string;

type Auth = Record<string, string>;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pathOf = (url: string) => `${new URL(url).pathname}${new URL(url).search}`;

beforeAll(async () => {
  superAdmin = await adminActor(app);
  otherSuperAdmin = await adminActor(app);
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  specialtyId = (
    await superAdmin
      .post('/admin/v1/reference-data/specialties')
      .send({
        code: `CARDIO_${suffix}`,
        nameFr: `Cardiologie ${suffix}`,
        nameEn: `Cardiology ${suffix}`,
        reason: 'Initial list',
      })
      .expect(200)
  ).body.id;
  institutionId = (
    await superAdmin
      .post('/admin/v1/reference-data/institutions')
      .send({ name: `CHU Mustapha ${suffix}`, wilayaCode: 16, reason: 'Initial list' })
      .expect(200)
  ).body.id;
  universityId = (
    await superAdmin
      .post('/admin/v1/reference-data/universities')
      .send({ name: `Université d’Alger 1 ${suffix}`, wilayaCode: 16, reason: 'Initial list' })
      .expect(200)
  ).body.id;
});

/** A confirmed account that chose `type` but has no verification yet. */
async function newPerson(
  type: 'DOCTOR' | 'RESIDENT' | 'STUDENT',
): Promise<{ userId: string; auth: Auth }> {
  const identifier = uniqueEmail(`verify-${type.toLowerCase()}`);
  const { body } = await app
    .http()
    .post('/v1/auth/sign-up')
    .send({
      identifier,
      password: 'user password for tests',
      firstName: 'Amina',
      lastName: 'Test',
      wilayaCode: 16,
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
      device: { id: `device-${randomUUID()}`, platform: 'ANDROID' },
    })
    .expect(200);
  const auth = { Authorization: `Bearer ${tokens.body.accessToken}` };
  await app
    .http()
    .post('/v1/me/professional-profile')
    .set(auth)
    .send({ professionalType: type, ...(type === 'STUDENT' ? { academicYear: 3 } : {}) })
    .expect(200);
  const userId = (await app.prisma().user.findUniqueOrThrow({ where: { email: identifier } })).id;
  return { userId, auth };
}

async function uploadStep(
  auth: Auth,
  caseId: string,
  stepType: string,
  status = 200,
  bytes = JPEG,
  contentType = 'image/jpeg',
) {
  const start = await app
    .http()
    .post(`/v1/me/verification/cases/${caseId}/uploads`)
    .set(auth)
    .send({ stepType, contentType, sizeBytes: bytes.byteLength, sha256: sha256(bytes) })
    .expect(200);
  await app
    .http()
    .put(pathOf(start.body.upload.url))
    .set('Content-Type', contentType)
    .send(bytes)
    .expect(200);
  return app
    .http()
    .post(`/v1/me/verification/cases/${caseId}/documents`)
    .set(auth)
    .send({ intentId: start.body.upload.intentId, documentId: start.body.documentId, stepType })
    .expect(status);
}

const DETAILS: Record<string, () => Record<string, unknown>> = {
  IDENTITY: () => ({ documentKind: 'NATIONAL_ID' }),
  DOCTOR: () => ({ orderNumber: 'AB-123456', specialtyId }),
  RESIDENT: () => ({ residencyYear: 2, institutionId, specialtyId }),
  STUDENT: () => ({ universityId, academicYear: 3 }),
};
const STEP: Record<string, string> = {
  IDENTITY: 'IDENTITY_FRONT',
  DOCTOR: 'ORDER_PROOF',
  RESIDENT: 'RESIDENCY_ATTESTATION',
  STUDENT: 'STUDENT_PROOF',
};

/** Starts, fills, uploads and submits a case the way the app does. */
async function submitCase(
  auth: Auth,
  type: 'IDENTITY' | 'PROFESSIONAL_STATUS' | 'STUDENT_STATUS',
  target?: 'DOCTOR' | 'RESIDENT',
): Promise<string> {
  const started = await app
    .http()
    .post('/v1/me/verification/cases')
    .set(auth)
    .send({ type, ...(target ? { professionalType: target } : {}) })
    .expect(200);
  const caseId = started.body.id as string;
  const key =
    type === 'IDENTITY' ? 'IDENTITY' : type === 'STUDENT_STATUS' ? 'STUDENT' : (target ?? 'DOCTOR');
  await app
    .http()
    .put(`/v1/me/verification/cases/${caseId}/details`)
    .set(auth)
    .send(DETAILS[key]!())
    .expect(200);
  await uploadStep(auth, caseId, STEP[key]!, 200);
  await app.http().post(`/v1/me/verification/cases/${caseId}/submit`).set(auth).expect(200);
  return caseId;
}

const purchase = async (auth: Auth) =>
  (
    (await app.http().get('/v1/me/access').set(auth).expect(200)).body.features as {
      key: string;
      state: string;
      lockReason: string | null;
    }[]
  ).find((feature) => feature.key === 'subscription.purchase');

const accessTier = async (auth: Auth) =>
  (await app.http().get('/v1/me/access').set(auth).expect(200)).body.tier as string;

const auditActions = async (entityId: string) =>
  (
    await app.prisma().auditLogEntry.findMany({
      where: { entityId },
      orderBy: { id: 'asc' },
      select: { action: true },
    })
  ).map((entry) => entry.action);

async function decide(
  admin: AdminActor,
  caseId: string,
  decision: 'approve' | 'reject',
  body: Record<string, unknown> = {},
) {
  await admin.post(`/admin/v1/verification/cases/${caseId}/claim`).expect(200);
  const payload =
    decision === 'approve'
      ? { reason: 'Documents match the declared details', ...body }
      : {
          reason: 'Photo unreadable',
          reasonCode: 'ILLEGIBLE',
          note: 'Reprenez la photo sans reflet.',
          ...body,
        };
  return admin.post(`/admin/v1/verification/cases/${caseId}/${decision}`).send(payload).expect(200);
}

describe('doctor verification', () => {
  it('verifies identity and Ordre status, masks the number and unlocks the unpaid tier', async () => {
    const { userId, auth } = await newPerson('DOCTOR');
    const overview = await app.http().get('/v1/me/verification').set(auth).expect(200);
    expect(overview.body.professionalType).toBe('DOCTOR');
    expect(
      overview.body.types.map((state: { type: string; canStart: boolean }) => [
        state.type,
        state.canStart,
      ]),
    ).toEqual([
      ['IDENTITY', true],
      ['PROFESSIONAL_STATUS', true],
      ['STUDENT_STATUS', false],
    ]);

    const identityId = await submitCase(auth, 'IDENTITY');
    const statusId = await submitCase(auth, 'PROFESSIONAL_STATUS');
    expect(await accessTier(auth)).toBe('PROFESSIONAL_UNPAID');
    expect(await purchase(auth)).toMatchObject({
      state: 'LOCKED',
      lockReason: 'VERIFICATION_PENDING',
    });

    const queue = await superAdmin.get('/admin/v1/verification/cases').expect(200);
    expect(queue.body.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([identityId, statusId]),
    );

    await decide(superAdmin, identityId, 'approve');
    const detail = await superAdmin.get(`/admin/v1/verification/cases/${statusId}`).expect(200);
    expect(detail.body.details.orderNumber).toBe('AB-123456');
    expect(detail.body.references.specialty).toMatch(/^Cardiologie/);
    const expiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
    await decide(superAdmin, statusId, 'approve', { expiresAt });

    const mine = await app.http().get('/v1/me/verification').set(auth).expect(200);
    const status = mine.body.types.find(
      (state: { type: string }) => state.type === 'PROFESSIONAL_STATUS',
    ).latest;
    expect(status.status).toBe('VERIFIED');
    expect(status.details.orderNumber).toBe('••••••456');
    expect(status.expiresAt).toBe(expiresAt);
    const profile = await app.prisma().professionalProfile.findUniqueOrThrow({ where: { userId } });
    expect(profile).toMatchObject({
      professionalType: 'DOCTOR',
      specialtyId,
      orderNumberMasked: '••••••456',
    });
    expect(await accessTier(auth)).toBe('PROFESSIONAL_UNPAID');
    expect(await purchase(auth)).toMatchObject({ state: 'AVAILABLE' });

    const notifications = await app.http().get('/v1/me/notifications').set(auth).expect(200);
    expect(notifications.body.unreadCount).toBe(2);
    expect(notifications.body.items[0]).toMatchObject({
      messageKey: 'mobile.notifications.verificationApproved',
      params: { caseId: statusId, caseType: 'PROFESSIONAL_STATUS' },
    });
    await app.http().post('/v1/me/notifications/read-all').set(auth).expect(204);
    expect(
      (await app.http().get('/v1/me/notifications').set(auth).expect(200)).body.unreadCount,
    ).toBe(0);

    expect(await auditActions(statusId)).toEqual([
      'verification.submitted',
      'verification.claimed',
      'verification.approved',
    ]);
    const documents = await app
      .prisma()
      .verificationDocument.findMany({ where: { caseId: statusId } });
    expect(documents[0]?.purgeAfter?.getTime()).toBeGreaterThan(Date.now() + 700 * 86_400_000);
  });

  it('opens a document only for the reviewer holding the case, for 60 seconds, with an audit row', async () => {
    const { auth } = await newPerson('DOCTOR');
    const caseId = await submitCase(auth, 'IDENTITY');
    const detail = await superAdmin.get(`/admin/v1/verification/cases/${caseId}`).expect(200);
    const documentId = detail.body.documents[0].id as string;

    await superAdmin.post(`/admin/v1/verification/documents/${documentId}/view`).expect(409);
    await superAdmin.post(`/admin/v1/verification/cases/${caseId}/claim`).expect(200);
    await otherSuperAdmin.post(`/admin/v1/verification/documents/${documentId}/view`).expect(409);

    const view = await superAdmin
      .post(`/admin/v1/verification/documents/${documentId}/view`)
      .expect(200);
    expect(view.body.contentType).toBe('image/jpeg');
    expect(view.body.watermark).toMatch(/^Test SUPER_ADMIN · /);
    expect(new Date(view.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    const file = await app.http().get(pathOf(view.body.url)).expect(200);
    expect(Buffer.from(file.body as Buffer)).toEqual(JPEG);
    expect(await auditActions(documentId)).toEqual(['verification.document_viewed']);

    const reviewer = await adminActor(app, 'VERIFICATION_REVIEWER');
    await reviewer.post(`/admin/v1/verification/documents/${documentId}/view`).expect(403);
  });
});

describe('rejection and appeal', () => {
  it('shows the reason, lets the person correct, and routes the appeal to another reviewer', async () => {
    const { auth } = await newPerson('DOCTOR');
    const first = await submitCase(auth, 'IDENTITY');
    await decide(superAdmin, first, 'reject');
    let overview = await app.http().get('/v1/me/verification').set(auth).expect(200);
    let identity = overview.body.types[0];
    expect(identity.canStart).toBe(true);
    expect(identity.latest).toMatchObject({
      status: 'REJECTED',
      rejection: { reasonCode: 'ILLEGIBLE', note: 'Reprenez la photo sans reflet.' },
      canAppeal: false,
    });
    await app.http().post(`/v1/me/verification/cases/${first}/appeal`).set(auth).expect(409);

    const second = await submitCase(auth, 'IDENTITY');
    await decide(superAdmin, second, 'reject', { reasonCode: 'NAME_MISMATCH', note: undefined });
    overview = await app.http().get('/v1/me/verification').set(auth).expect(200);
    identity = overview.body.types[0];
    expect(identity.latest.canAppeal).toBe(true);
    expect(await accessTier(auth)).toBe('RESTRICTED');

    await app.http().post(`/v1/me/verification/cases/${second}/appeal`).set(auth).expect(200);
    await app.http().post(`/v1/me/verification/cases/${first}/appeal`).set(auth).expect(409);

    await superAdmin.post(`/admin/v1/verification/cases/${second}/claim`).expect(403);
    const reviewer = await adminActor(app, 'VERIFICATION_REVIEWER');
    await reviewer.post(`/admin/v1/verification/cases/${second}/claim`).expect(403);

    const decided = await decide(otherSuperAdmin, second, 'approve');
    expect(decided.body).toMatchObject({ status: 'VERIFIED', rejectedBy: { id: superAdmin.id } });
    expect(await auditActions(second)).toEqual([
      'verification.submitted',
      'verification.claimed',
      'verification.rejected',
      'verification.appealed',
      'verification.claimed',
      'verification.appeal_approved',
    ]);
  });

  it('gives a claimed case back to the queue', async () => {
    const { auth } = await newPerson('RESIDENT');
    const caseId = await submitCase(auth, 'PROFESSIONAL_STATUS', 'RESIDENT');
    await superAdmin.post(`/admin/v1/verification/cases/${caseId}/claim`).expect(200);
    await otherSuperAdmin.post(`/admin/v1/verification/cases/${caseId}/claim`).expect(409);
    await otherSuperAdmin
      .post(`/admin/v1/verification/cases/${caseId}/approve`)
      .send({ reason: 'Not mine' })
      .expect(409);
    const released = await superAdmin
      .post(`/admin/v1/verification/cases/${caseId}/release`)
      .send({ reason: 'Out of office' })
      .expect(200);
    expect(released.body).toMatchObject({ status: 'SUBMITTED', reviewer: null });
    await otherSuperAdmin.post(`/admin/v1/verification/cases/${caseId}/claim`).expect(200);
  });
});

describe('students and role transitions', () => {
  it('verifies a student, then turns the same account into a resident', async () => {
    const { userId, auth } = await newPerson('STUDENT');
    const studentCase = await submitCase(auth, 'STUDENT_STATUS');
    await decide(superAdmin, studentCase, 'approve');
    expect(await accessTier(auth)).toBe('STUDENT');
    await app
      .http()
      .post('/v1/me/verification/cases')
      .set(auth)
      .send({ type: 'STUDENT_STATUS' })
      .expect(409);

    const residentCase = await submitCase(auth, 'PROFESSIONAL_STATUS', 'RESIDENT');
    expect(await accessTier(auth)).toBe('STUDENT');
    await decide(superAdmin, residentCase, 'approve');
    const profile = await app.prisma().professionalProfile.findUniqueOrThrow({ where: { userId } });
    expect(profile).toMatchObject({
      professionalType: 'RESIDENT',
      residencyYear: 2,
      institutionId,
      specialtyId,
      academicYear: null,
      universityId: null,
    });
    expect(await accessTier(auth)).toBe('PROFESSIONAL_UNPAID');
  });

  it('never moves a person to an earlier role', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    await app
      .http()
      .post('/v1/me/verification/cases')
      .set(auth)
      .send({ type: 'STUDENT_STATUS' })
      .expect(409);
    await app
      .http()
      .post('/v1/me/verification/cases')
      .set(auth)
      .send({ type: 'PROFESSIONAL_STATUS', professionalType: 'RESIDENT' })
      .expect(409);
  });
});

describe('preparing a case', () => {
  it('validates details, steps and the single open case', async () => {
    const { auth } = await newPerson('DOCTOR');
    const started = await app
      .http()
      .post('/v1/me/verification/cases')
      .set(auth)
      .send({ type: 'IDENTITY' })
      .expect(200);
    const caseId = started.body.id as string;
    expect(started.body.steps).toEqual([
      { stepType: 'IDENTITY_FRONT', required: true, provided: false },
      { stepType: 'IDENTITY_BACK', required: false, provided: false },
    ]);
    await app
      .http()
      .post('/v1/me/verification/cases')
      .set(auth)
      .send({ type: 'IDENTITY' })
      .expect(409);

    const studentCard = await app
      .http()
      .put(`/v1/me/verification/cases/${caseId}/details`)
      .set(auth)
      .send({ documentKind: 'STUDENT_CARD' })
      .expect(400);
    expect(studentCard.body.error.details.fields.documentKind).toBeDefined();
    const extra = await app
      .http()
      .put(`/v1/me/verification/cases/${caseId}/details`)
      .set(auth)
      .send({ documentKind: 'PASSPORT', universityId })
      .expect(400);
    expect(extra.body.error.code).toBe('VALIDATION_FAILED');

    await app
      .http()
      .put(`/v1/me/verification/cases/${caseId}/details`)
      .set(auth)
      .send({ documentKind: 'PASSPORT' })
      .expect(200);
    const missing = await app
      .http()
      .post(`/v1/me/verification/cases/${caseId}/submit`)
      .set(auth)
      .expect(400);
    expect(missing.body.error.details.fields.steps).toEqual(['IDENTITY_FRONT']);

    await app
      .http()
      .post(`/v1/me/verification/cases/${caseId}/uploads`)
      .set(auth)
      .send({
        stepType: 'ORDER_PROOF',
        contentType: 'image/jpeg',
        sizeBytes: 12,
        sha256: sha256(JPEG),
      })
      .expect(400);
    await app
      .http()
      .post(`/v1/me/verification/cases/${caseId}/uploads`)
      .set(auth)
      .send({
        stepType: 'IDENTITY_FRONT',
        contentType: 'image/gif',
        sizeBytes: 12,
        sha256: sha256(JPEG),
      })
      .expect(400);

    const first = await uploadStep(auth, caseId, 'IDENTITY_FRONT', 200);
    const firstKey = (
      await app
        .prisma()
        .verificationDocument.findUniqueOrThrow({ where: { id: first.body.documents[0].id } })
    ).storageKey;
    const replaced = await uploadStep(auth, caseId, 'IDENTITY_FRONT', 200, PDF, 'application/pdf');
    expect(replaced.body.documents).toHaveLength(1);
    expect(replaced.body.documents[0]).toMatchObject({
      stepType: 'IDENTITY_FRONT',
      contentType: 'application/pdf',
    });
    expect(await app.get(StorageService).head('PRIVATE', firstKey)).toBeNull();

    const back = await uploadStep(auth, caseId, 'IDENTITY_BACK', 200);
    const backId = back.body.documents.find(
      (document: { stepType: string }) => document.stepType === 'IDENTITY_BACK',
    ).id;
    const removed = await app
      .http()
      .delete(`/v1/me/verification/cases/${caseId}/documents/${backId}`)
      .set(auth)
      .expect(200);
    expect(removed.body.documents).toHaveLength(1);

    await app.http().post(`/v1/me/verification/cases/${caseId}/submit`).set(auth).expect(200);
    await app.http().post(`/v1/me/verification/cases/${caseId}/submit`).set(auth).expect(409);
    await app
      .http()
      .put(`/v1/me/verification/cases/${caseId}/details`)
      .set(auth)
      .send({ documentKind: 'NATIONAL_ID' })
      .expect(409);
    await app
      .http()
      .post(`/v1/me/verification/cases/${caseId}/uploads`)
      .set(auth)
      .send({
        stepType: 'IDENTITY_BACK',
        contentType: 'image/jpeg',
        sizeBytes: 12,
        sha256: sha256(JPEG),
      })
      .expect(409);
  });

  it('refuses an upload that is not the file of this step', async () => {
    const { auth } = await newPerson('DOCTOR');
    const started = await app
      .http()
      .post('/v1/me/verification/cases')
      .set(auth)
      .send({ type: 'IDENTITY' })
      .expect(200);
    const start = await app
      .http()
      .post(`/v1/me/verification/cases/${started.body.id}/uploads`)
      .set(auth)
      .send({
        stepType: 'IDENTITY_FRONT',
        contentType: 'image/jpeg',
        sizeBytes: JPEG.byteLength,
        sha256: sha256(JPEG),
      })
      .expect(200);
    await app
      .http()
      .put(pathOf(start.body.upload.url))
      .set('Content-Type', 'image/jpeg')
      .send(JPEG)
      .expect(200);
    await app
      .http()
      .post(`/v1/me/verification/cases/${started.body.id}/documents`)
      .set(auth)
      .send({
        intentId: start.body.upload.intentId,
        documentId: randomUUID(),
        stepType: 'IDENTITY_FRONT',
      })
      .expect(422);
  });

  it('keeps cases private to their owner and closed to demo tokens', async () => {
    const owner = await newPerson('DOCTOR');
    const stranger = await newPerson('DOCTOR');
    const started = await app
      .http()
      .post('/v1/me/verification/cases')
      .set(owner.auth)
      .send({ type: 'IDENTITY' })
      .expect(200);
    await app
      .http()
      .put(`/v1/me/verification/cases/${started.body.id}/details`)
      .set(stranger.auth)
      .send({ documentKind: 'PASSPORT' })
      .expect(404);
    const demo = await demoActor(app);
    await app.http().get('/v1/me/verification').set(demo.auth).expect(401);
    await app.http().get('/v1/me/notifications').set(demo.auth).expect(401);
  });

  it('requires choosing a role first', async () => {
    const identifier = uniqueEmail('no-role');
    const { body } = await app
      .http()
      .post('/v1/auth/sign-up')
      .send({
        identifier,
        password: 'user password for tests',
        firstName: 'A',
        lastName: 'B',
        wilayaCode: 16,
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
        device: { id: `device-${randomUUID()}`, platform: 'IOS' },
      })
      .expect(200);
    await app
      .http()
      .post('/v1/me/verification/cases')
      .set({ Authorization: `Bearer ${tokens.body.accessToken}` })
      .send({ type: 'IDENTITY' })
      .expect(409);
  });
});

describe('retention and expiry', () => {
  it('erases files on request after the decision', async () => {
    const { auth } = await newPerson('DOCTOR');
    const caseId = await submitCase(auth, 'IDENTITY');
    await app.http().post(`/v1/me/verification/cases/${caseId}/erase`).set(auth).expect(409);
    await decide(superAdmin, caseId, 'approve');
    const key = (await app.prisma().verificationDocument.findFirstOrThrow({ where: { caseId } }))
      .storageKey;
    const erased = await app
      .http()
      .post(`/v1/me/verification/cases/${caseId}/erase`)
      .set(auth)
      .expect(200);
    expect(erased.body).toMatchObject({ status: 'VERIFIED', documents: [], details: {} });
    expect(await app.get(StorageService).head('PRIVATE', key)).toBeNull();
    expect(await auditActions(caseId)).toContain('verification.documents_erased');
  });

  it('reminds at 60 and 14 days, expires, and purges after retention', async () => {
    const { auth } = await newPerson('DOCTOR');
    const caseId = await submitCase(auth, 'PROFESSIONAL_STATUS');
    await decide(superAdmin, caseId, 'approve', {
      expiresAt: new Date(Date.now() + 50 * 86_400_000).toISOString(),
    });
    const maintenance = app.get(VerificationMaintenanceService);
    const prisma = app.prisma();
    const reminders = () =>
      prisma.notification.findMany({
        where: { type: 'verification.expiring', params: { path: ['caseId'], equals: caseId } },
      });

    await maintenance.sendExpiryReminders();
    await maintenance.sendExpiryReminders();
    expect((await reminders()).map((row) => (row.params as { reminder: number }).reminder)).toEqual(
      [60],
    );
    expect(await startAllowed(app, auth)).toBe(true);

    await prisma.verificationCase.update({
      where: { id: caseId },
      data: { expiresAt: new Date(Date.now() + 10 * 86_400_000) },
    });
    await maintenance.sendExpiryReminders();
    expect(
      (await reminders()).map((row) => (row.params as { reminder: number }).reminder).sort(),
    ).toEqual([14, 60]);

    await prisma.verificationCase.update({
      where: { id: caseId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await maintenance.expireCases();
    const expired = await prisma.verificationCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(expired.status).toBe('EXPIRED');
    expect(await accessTier(auth)).toBe('PROFESSIONAL_UNPAID');

    const key = (await prisma.verificationDocument.findFirstOrThrow({ where: { caseId } }))
      .storageKey;
    await prisma.verificationDocument.updateMany({
      where: { caseId },
      data: { purgeAfter: new Date(Date.now() - 1000) },
    });
    await prisma.verificationCase.update({
      where: { id: caseId },
      data: { decidedAt: new Date(Date.now() - 800 * 86_400_000) },
    });
    await maintenance.purge();
    expect(await prisma.verificationDocument.count({ where: { caseId } })).toBe(0);
    expect(await app.get(StorageService).head('PRIVATE', key)).toBeNull();
    expect(
      (await prisma.verificationCase.findUniqueOrThrow({ where: { id: caseId } })).declaredDetails,
    ).toEqual({});
  });

  it('deletes cases abandoned before submission', async () => {
    const { auth } = await newPerson('DOCTOR');
    const started = await app
      .http()
      .post('/v1/me/verification/cases')
      .set(auth)
      .send({ type: 'IDENTITY' })
      .expect(200);
    await uploadStep(auth, started.body.id as string, 'IDENTITY_FRONT', 200);
    await app.prisma()
      .$executeRaw`UPDATE verification_cases SET updated_at = now() - interval '100 days' WHERE id = ${started.body.id}::uuid`;
    await app.get(VerificationMaintenanceService).purge();
    expect(await app.prisma().verificationCase.count({ where: { id: started.body.id } })).toBe(0);
  });
});

describe('reference pickers', () => {
  it('lists publicly and is managed with system.settings.write only', async () => {
    const specialties = await app.http().get('/v1/specialties').expect(200);
    expect(specialties.body.some((item: { id: string }) => item.id === specialtyId)).toBe(true);
    const institutions = await app
      .http()
      .get('/v1/institutions')
      .query({ wilayaCode: 16 })
      .expect(200);
    expect(institutions.body.some((item: { id: string }) => item.id === institutionId)).toBe(true);
    const elsewhere = await app
      .http()
      .get('/v1/institutions')
      .query({ wilayaCode: 31 })
      .expect(200);
    expect(elsewhere.body.some((item: { id: string }) => item.id === institutionId)).toBe(false);
    await app.http().get('/v1/universities').expect(200);

    const duplicate = await superAdmin
      .post('/admin/v1/reference-data/institutions')
      .send({
        name: institutions.body.find((item: { id: string }) => item.id === institutionId).name,
        wilayaCode: 16,
        reason: 'Again',
      })
      .expect(409);
    expect(duplicate.body.error.code).toBe('VERSION_CONFLICT');
    await superAdmin
      .post('/admin/v1/reference-data/universities')
      .send({ name: 'Université inconnue', wilayaCode: 99, reason: 'Unknown wilaya' })
      .expect(400);
    const reviewer = await adminActor(app, 'VERIFICATION_REVIEWER');
    await reviewer
      .post('/admin/v1/reference-data/specialties')
      .send({ code: 'NEPHRO', nameFr: 'Néphrologie', nameEn: 'Nephrology', reason: 'Not allowed' })
      .expect(403);
  });
});

async function startAllowed(testApp: TestApp, auth: Auth): Promise<boolean> {
  const overview = await testApp.http().get('/v1/me/verification').set(auth).expect(200);
  return overview.body.types.find((state: { type: string }) => state.type === 'PROFESSIONAL_STATUS')
    .canStart as boolean;
}
