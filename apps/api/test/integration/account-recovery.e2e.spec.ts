// ADR-023 exit criterion: a person can keep two contacts and change them safely, is told of every
// change, and — having lost both contacts and the password — gets the account back through a
// reviewed request that the real owner can stop.
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { AccountRecoveryService } from '../../src/modules/auth/account-recovery.service.js';
import { type AdminActor, adminActor } from './actors.js';
import { uniqueEmail, useTestApp } from './app.js';
import { TEST_TERMS_VERSION } from '../support/env.js';

const app = useTestApp();
let superAdmin: AdminActor;

const PASSWORD = 'first password for tests';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pathOf = (url: string) => `${new URL(url).pathname}${new URL(url).search}`;
const uniquePhone = () => `+21366${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
const device = () => ({ id: `device-${randomUUID()}`, platform: 'ANDROID' });

beforeAll(async () => {
  superAdmin = await adminActor(app);
});

/** A confirmed account signed up with an e-mail, signed in on one device. */
async function account() {
  const email = uniqueEmail('owner');
  const started = await app
    .http()
    .post('/v1/auth/sign-up')
    .send({
      identifier: email,
      password: PASSWORD,
      firstName: 'Amina',
      lastName: 'Belkacem',
      wilayaCode: 16,
      acceptTerms: true,
      termsVersion: TEST_TERMS_VERSION,
    })
    .expect(202);
  const tokens = await app
    .http()
    .post('/v1/auth/sign-up/confirm')
    .send({ challengeId: started.body.challengeId, code: app.lastCode(email), device: device() })
    .expect(200);
  const userId = (await app.prisma().user.findUniqueOrThrow({ where: { email } })).id;
  return { email, userId, auth: { Authorization: `Bearer ${tokens.body.accessToken}` } };
}

const signIn = (identifier: string, password = PASSWORD) =>
  app.http().post('/v1/auth/sign-in').send({ identifier, password, device: device() });

async function addContact(auth: Record<string, string>, identifier: string) {
  const challenge = await app
    .http()
    .post('/v1/me/contacts')
    .set(auth)
    .send({ identifier, password: PASSWORD })
    .expect(202);
  return app
    .http()
    .post('/v1/me/contacts/confirm')
    .set(auth)
    .send({ challengeId: challenge.body.challengeId, code: app.lastCode(identifier) })
    .expect(200);
}

describe('contacts', () => {
  it('adds a phone proven by a code, warns the e-mail, and lets the person sign in with it', async () => {
    const { email, auth } = await account();
    const phone = uniquePhone();
    await app
      .http()
      .post('/v1/me/contacts')
      .set(auth)
      .send({ identifier: phone, password: 'wrong password' })
      .expect(400);

    const contacts = await addContact(auth, phone);
    expect(contacts.body).toMatchObject({
      email,
      emailConfirmed: true,
      phone,
      phoneConfirmed: true,
      recoverable: true,
      pendingRecovery: null,
    });
    expect(app.messages(email).at(-1)).toContain('un numéro de téléphone a été ajouté');
    await signIn(phone).expect(200);
  });

  it('replaces the e-mail, telling the old address, which no longer signs in', async () => {
    const { email, auth } = await account();
    const next = uniqueEmail('next');
    await addContact(auth, next);
    expect(app.messages(email).at(-1)).toContain('vient d’être remplacé');
    await signIn(email).expect(401);
    await signIn(next).expect(200);
  });

  it('refuses a contact another account confirmed, and keeps one confirmed contact', async () => {
    const first = await account();
    const second = await account();
    const taken = await app
      .http()
      .post('/v1/me/contacts')
      .set(second.auth)
      .send({ identifier: first.email, password: PASSWORD })
      .expect(409);
    expect(taken.body.error.code).toBe('ACCOUNT_EXISTS');

    await app
      .http()
      .post('/v1/me/contacts/remove')
      .set(first.auth)
      .send({ channel: 'EMAIL', password: PASSWORD })
      .expect(409);
    const phone = uniquePhone();
    await addContact(first.auth, phone);
    const removed = await app
      .http()
      .post('/v1/me/contacts/remove')
      .set(first.auth)
      .send({ channel: 'EMAIL', password: PASSWORD })
      .expect(200);
    expect(removed.body).toMatchObject({ email: null, phone, recoverable: false });
    expect(app.messages(first.email).at(-1)).toContain('l’adresse e-mail a été retirée');
  });
});

describe('password change', () => {
  it('keeps this device signed in, signs the others out and tells the person', async () => {
    const { email, auth } = await account();
    const other = await signIn(email).expect(200);
    await app
      .http()
      .post('/v1/me/password')
      .set(auth)
      .send({ currentPassword: 'wrong password', newPassword: 'second password for tests' })
      .expect(400);
    await app
      .http()
      .post('/v1/me/password')
      .set(auth)
      .send({ currentPassword: PASSWORD, newPassword: 'second password for tests' })
      .expect(204);
    await app.http().get('/v1/me').set(auth).expect(200);
    await app
      .http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: other.body.refreshToken, deviceId: 'x'.repeat(8) })
      .expect(401);
    await signIn(email).expect(401);
    await signIn(email, 'second password for tests').expect(200);
    expect(app.messages(email).at(-1)).toContain('mot de passe de votre compte DokTool vient');
  });
});

/** The person who lost everything: new contact proven, two photos, submitted. */
async function requestRecovery(lostIdentifier: string, newIdentifier = uniquePhone()) {
  const started = await app
    .http()
    .post('/v1/auth/recovery')
    .send({ lostIdentifier, newIdentifier, firstName: 'Amina', lastName: 'Belkacem' })
    .expect(202);
  const token = await app
    .http()
    .post('/v1/auth/recovery/confirm')
    .send({
      requestId: started.body.requestId,
      challengeId: started.body.challenge.challengeId,
      code: app.lastCode(newIdentifier),
    })
    .expect(200);
  const recoveryToken: string = token.body.recoveryToken;
  for (const slot of ['IDENTITY_DOCUMENT', 'SELFIE']) {
    const ticket = await app
      .http()
      .post('/v1/auth/recovery/uploads')
      .send({
        recoveryToken,
        slot,
        contentType: 'image/jpeg',
        sizeBytes: JPEG.byteLength,
        sha256: sha256(JPEG),
      })
      .expect(200);
    await app
      .http()
      .put(pathOf(ticket.body.url))
      .set('Content-Type', 'image/jpeg')
      .send(JPEG)
      .expect(200);
    await app
      .http()
      .post('/v1/auth/recovery/photos')
      .send({ recoveryToken, slot, intentId: ticket.body.intentId })
      .expect(204);
  }
  return { requestId: started.body.requestId as string, recoveryToken, newIdentifier };
}

describe('assisted recovery', () => {
  it('gives the account back after review and the waiting period', async () => {
    const owner = await account();
    const { requestId, recoveryToken, newIdentifier } = await requestRecovery(owner.email);
    const submitted = await app
      .http()
      .post('/v1/auth/recovery/submit')
      .send({ recoveryToken })
      .expect(200);
    expect(submitted.body).toEqual({ answerWithinHours: 72 });
    // The token is spent; the owner is warned on the e-mail of the account.
    await app.http().post('/v1/auth/recovery/submit').send({ recoveryToken }).expect(401);
    expect(app.messages(owner.email).at(-1)).toContain('quelqu’un a demandé à récupérer');
    expect(app.messages(newIdentifier).at(-1)).toContain('sous 72 heures');

    const detail = await superAdmin.get(`/admin/v1/account-recoveries/${requestId}`).expect(200);
    expect(detail.body.request).toMatchObject({
      status: 'SUBMITTED',
      claimedIdentifier: owner.email,
      userId: owner.userId,
      hasIdentityPhoto: true,
      hasSelfie: true,
    });
    expect(detail.body.account).toMatchObject({ id: owner.userId, email: owner.email });
    const photo = await superAdmin
      .post(`/admin/v1/account-recoveries/${requestId}/photos/SELFIE`)
      .expect(200);
    expect(photo.body.watermark).toContain('Test SUPER_ADMIN');

    const approved = await superAdmin
      .post(`/admin/v1/account-recoveries/${requestId}/approve`)
      .send({ note: 'ID card matches the account name; selfie matches the ID.' })
      .expect(200);
    expect(approved.body.request.status).toBe('APPROVED');
    const effectiveAt = new Date(approved.body.request.effectiveAt);
    expect(effectiveAt.getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000);
    const pending = await app.http().get('/v1/me/contacts').set(owner.auth).expect(200);
    expect(pending.body.pendingRecovery).toMatchObject({ status: 'APPROVED' });

    const recovery = app.get(AccountRecoveryService);
    expect(await recovery.applyDue(new Date())).toBe(0);
    expect(await recovery.applyDue(new Date(effectiveAt.getTime() + 60_000))).toBe(1);

    const user = await app.prisma().user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(user).toMatchObject({ email: null, phone: newIdentifier });
    expect(user.phoneConfirmedAt).not.toBeNull();
    await app.http().get('/v1/me').set(owner.auth).expect(401);
    await signIn(newIdentifier).expect(401);
    expect(app.messages(owner.email).at(-1)).toContain('ont été remplacées');
    expect(app.messages(newIdentifier).at(-1)).toContain('Mot de passe oublié');

    // « Mot de passe oublié » on the new contact opens the account.
    const reset = await app
      .http()
      .post('/v1/auth/password-reset')
      .send({ identifier: newIdentifier })
      .expect(202);
    await app
      .http()
      .post('/v1/auth/password-reset/confirm')
      .send({
        challengeId: reset.body.challengeId,
        code: app.lastCode(newIdentifier),
        newPassword: 'recovered password for tests',
      })
      .expect(204);
    await signIn(newIdentifier, 'recovered password for tests').expect(200);
  });

  it('stops when the owner signs in or taps « Ce n’est pas moi »', async () => {
    const owner = await account();
    const first = await requestRecovery(owner.email);
    await app
      .http()
      .post('/v1/auth/recovery/submit')
      .send({ recoveryToken: first.recoveryToken })
      .expect(200);
    await signIn(owner.email).expect(200);
    const canceled = await superAdmin
      .get(`/admin/v1/account-recoveries/${first.requestId}`)
      .expect(200);
    expect(canceled.body.request.status).toBe('CANCELED');
    expect(app.messages(first.newIdentifier).at(-1)).toContain('a été annulée');

    const second = await requestRecovery(owner.email);
    await app
      .http()
      .post('/v1/auth/recovery/submit')
      .send({ recoveryToken: second.recoveryToken })
      .expect(200);
    await superAdmin
      .post(`/admin/v1/account-recoveries/${second.requestId}/approve`)
      .send({ note: 'Looks right.' })
      .expect(200);
    const cancelled = await app.http().post('/v1/me/recovery/cancel').set(owner.auth).expect(200);
    expect(cancelled.body.pendingRecovery).toBeNull();
    expect(
      await app.get(AccountRecoveryService).applyDue(new Date(Date.now() + 2 * 86_400_000)),
    ).toBe(0);
  });

  it('never changes the account when the owner cancels while the job is applying', async () => {
    const owner = await account();
    const request = await requestRecovery(owner.email);
    await app
      .http()
      .post('/v1/auth/recovery/submit')
      .send({ recoveryToken: request.recoveryToken })
      .expect(200);
    await superAdmin
      .post(`/admin/v1/account-recoveries/${request.requestId}/approve`)
      .send({ note: 'Looks right.' })
      .expect(200);
    // The job read the approved request, then the owner signed in before it applied it.
    const stale = await app
      .prisma()
      .accountRecoveryRequest.findUniqueOrThrow({ where: { id: request.requestId } });
    await signIn(owner.email).expect(200);
    const recovery = app.get(AccountRecoveryService) as unknown as {
      apply(row: typeof stale, now: Date): Promise<void>;
    };
    await recovery.apply(stale, new Date(Date.now() + 2 * 86_400_000));

    const user = await app.prisma().user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(user).toMatchObject({ email: owner.email, phone: null });
    const after = await app
      .prisma()
      .accountRecoveryRequest.findUniqueOrThrow({ where: { id: request.requestId } });
    expect(after.status).toBe('CANCELED');
    await signIn(owner.email).expect(200);
  });

  it('answers the same for an unknown contact, and the reviewer rejects it with a reason', async () => {
    const { requestId, recoveryToken, newIdentifier } = await requestRecovery(
      uniqueEmail('nobody'),
    );
    await app.http().post('/v1/auth/recovery/submit').send({ recoveryToken }).expect(200);
    await superAdmin
      .post(`/admin/v1/account-recoveries/${requestId}/approve`)
      .send({ note: 'Trying anyway.' })
      .expect(409);
    const rejected = await superAdmin
      .post(`/admin/v1/account-recoveries/${requestId}/reject`)
      .send({ reason: 'NO_ACCOUNT', note: 'No account has this e-mail.' })
      .expect(200);
    expect(rejected.body).toMatchObject({ request: { status: 'REJECTED' }, account: null });
    expect(app.messages(newIdentifier).at(-1)).toContain('aucun compte ne correspond');
  });

  it('refuses a new contact that already opens an account, and missing photos', async () => {
    const owner = await account();
    const other = await account();
    const started = await app
      .http()
      .post('/v1/auth/recovery')
      .send({
        lostIdentifier: owner.email,
        newIdentifier: other.email,
        firstName: 'Amina',
        lastName: 'Belkacem',
      })
      .expect(202);
    const refused = await app
      .http()
      .post('/v1/auth/recovery/confirm')
      .send({
        requestId: started.body.requestId,
        challengeId: started.body.challenge.challengeId,
        code: app.lastCode(other.email),
      })
      .expect(409);
    expect(refused.body.error.code).toBe('ACCOUNT_EXISTS');

    const fresh = uniquePhone();
    const again = await app
      .http()
      .post('/v1/auth/recovery')
      .send({ lostIdentifier: owner.email, newIdentifier: fresh, firstName: 'A', lastName: 'B' })
      .expect(202);
    const token = await app
      .http()
      .post('/v1/auth/recovery/confirm')
      .send({
        requestId: again.body.requestId,
        challengeId: again.body.challenge.challengeId,
        code: app.lastCode(fresh),
      })
      .expect(200);
    const missing = await app
      .http()
      .post('/v1/auth/recovery/submit')
      .send({ recoveryToken: token.body.recoveryToken })
      .expect(400);
    expect(missing.body.error.details.fields.photos).toEqual(['IDENTITY_DOCUMENT', 'SELFIE']);
  });

  it('texts only allowed countries', async () => {
    const owner = await account();
    await app
      .http()
      .post('/v1/auth/recovery')
      .send({
        lostIdentifier: owner.email,
        newIdentifier: '+33612345678',
        firstName: 'Amina',
        lastName: 'Belkacem',
      })
      .expect(503);
  });
});
