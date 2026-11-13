// Phase 13: favorites, the person's own research history, profile edits and the profile photo.
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { StorageService } from '../../src/modules/storage/storage.service.js';
import { type AdminActor, adminActor, demoActor, userActor } from './actors.js';
import { useTestApp } from './app.js';
import { publishCalculator, publishReference } from './content.js';

const app = useTestApp();
let superAdmin: AdminActor;
let referenceId: string;
let calculatorId: string;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pathOf = (url: string) => `${new URL(url).pathname}${new URL(url).search}`;

beforeAll(async () => {
  superAdmin = await adminActor(app);
  const reviewer = await adminActor(app, 'CLINICAL_REVIEWER');
  referenceId = await publishReference(app, superAdmin, {
    titleFr: `Favori ${randomUUID().slice(0, 6)}`,
  });
  calculatorId = (
    await publishCalculator(superAdmin, reviewer, {
      nameFr: 'Surface favori',
      nameEn: 'Favorite area',
    })
  ).id;
});

describe('favorites', () => {
  it('adds, lists with access, survives a disabled model as « no longer available », and removes', async () => {
    const { auth } = await userActor(app, 'PROFESSIONAL');
    await app
      .http()
      .put(`/v1/me/favorites/REFERENCE_DOCUMENT/${referenceId}`)
      .set(auth)
      .expect(204);
    await app
      .http()
      .put(`/v1/me/favorites/REFERENCE_DOCUMENT/${referenceId}`)
      .set(auth)
      .expect(204);
    await app.http().put(`/v1/me/favorites/CALCULATOR/${calculatorId}`).set(auth).expect(204);
    await app.http().put(`/v1/me/favorites/CALCULATOR/${randomUUID()}`).set(auth).expect(404);

    const listed = await app.http().get('/v1/me/favorites').set(auth).expect(200);
    expect(listed.body).toHaveLength(2);
    expect(
      listed.body.find((f: { targetId: string }) => f.targetId === referenceId).item,
    ).toMatchObject({
      kind: 'ORDONNANCE',
      access: { state: 'AVAILABLE' },
    });

    const disabled = await publishReference(app, superAdmin, {
      titleFr: `Retiré ${randomUUID().slice(0, 6)}`,
    });
    await app.http().put(`/v1/me/favorites/REFERENCE_DOCUMENT/${disabled}`).set(auth).expect(204);
    await superAdmin
      .post(`/admin/v1/reference-documents/${disabled}/disable`)
      .send({ reason: 'Outdated guidance' })
      .expect(200);
    const after = await app.http().get('/v1/me/favorites').set(auth).expect(200);
    expect(after.body.find((f: { targetId: string }) => f.targetId === disabled).item).toBeNull();

    await app
      .http()
      .delete(`/v1/me/favorites/REFERENCE_DOCUMENT/${disabled}`)
      .set(auth)
      .expect(204);
    expect((await app.http().get('/v1/me/favorites').set(auth).expect(200)).body).toHaveLength(2);
  });

  it('is read-only for a restricted account: listed, never added; history is not kept', async () => {
    const { userId, auth } = await userActor(app, 'PROFESSIONAL_UNPAID');
    await app.http().put(`/v1/me/favorites/CALCULATOR/${calculatorId}`).set(auth).expect(204);
    await app
      .prisma()
      .verificationCase.updateMany({ where: { userId }, data: { status: 'REJECTED' } });
    expect((await app.http().get('/v1/me/access').set(auth).expect(200)).body.tier).toBe(
      'RESTRICTED',
    );

    const listed = await app.http().get('/v1/me/favorites').set(auth).expect(200);
    expect(listed.body).toHaveLength(1);
    const refused = await app
      .http()
      .put(`/v1/me/favorites/REFERENCE_DOCUMENT/${referenceId}`)
      .set(auth)
      .expect(403);
    expect(refused.body.error).toMatchObject({
      code: 'FEATURE_LOCKED',
      details: { lockReason: 'VERIFICATION_REQUIRED' },
    });
    await app
      .http()
      .post('/v1/me/activity')
      .set(auth)
      .send({
        deviceId: `device-${randomUUID()}`,
        entries: [{ kind: 'SEARCH', queryText: 'angine', occurredAt: new Date().toISOString() }],
      })
      .expect(204);
    expect(await app.prisma().recentActivity.count({ where: { userId } })).toBe(0);
  });

  it('is closed to demo tokens (demo favorites stay on the device)', async () => {
    const demo = await demoActor(app);
    await app.http().get('/v1/me/favorites').set(demo.auth).expect(401);
  });
});

describe('research history', () => {
  it('records device batches, pages newest first, filters by kind and clears', async () => {
    const { auth } = await userActor(app, 'STUDENT');
    const deviceId = `device-${randomUUID()}`;
    await app
      .http()
      .post('/v1/me/activity')
      .set(auth)
      .send({
        deviceId,
        entries: [
          { kind: 'SEARCH', queryText: 'clairance', occurredAt: '2026-09-20T10:00:00.000Z' },
          { kind: 'REFERENCE_VIEW', targetId: referenceId, occurredAt: '2026-09-20T10:01:00.000Z' },
          {
            kind: 'CALCULATOR_USE',
            targetId: calculatorId,
            occurredAt: '2026-09-20T10:02:00.000Z',
          },
        ],
      })
      .expect(204);
    const all = await app.http().get('/v1/me/activity').set(auth).expect(200);
    expect(all.body.map((entry: { kind: string }) => entry.kind)).toEqual([
      'CALCULATOR_USE',
      'REFERENCE_VIEW',
      'SEARCH',
    ]);
    // Each entry names what was opened and the access to it, so the app needs no list to show it.
    // A student opens calculators; an ordonnance is listed and locked (ADR-006 Q2).
    expect(all.body[0].item).toMatchObject({
      kind: 'CALCULATOR',
      titleFr: 'Surface favori',
      titleEn: 'Favorite area',
      access: { state: 'AVAILABLE' },
    });
    expect(all.body[0].item.slug).toEqual(expect.any(String));
    expect(all.body[1].item).toMatchObject({ kind: 'ORDONNANCE', access: { state: 'LOCKED' } });
    expect(all.body[2].item).toBeNull();
    const searches = await app
      .http()
      .get('/v1/me/activity')
      .query({ kind: 'SEARCH' })
      .set(auth)
      .expect(200);
    expect(searches.body).toMatchObject([{ queryText: 'clairance', targetId: null, item: null }]);

    await app
      .http()
      .post('/v1/me/activity')
      .set(auth)
      .send({ deviceId, entries: [{ kind: 'SEARCH', occurredAt: '2026-09-20T10:00:00.000Z' }] })
      .expect(400);
    await app
      .http()
      .post('/v1/me/activity')
      .set(auth)
      .send({
        deviceId,
        entries: [{ kind: 'CALCULATOR_USE', occurredAt: '2026-09-20T10:00:00.000Z' }],
      })
      .expect(400);

    await app.http().delete('/v1/me/activity').query({ kind: 'SEARCH' }).set(auth).expect(204);
    expect((await app.http().get('/v1/me/activity').set(auth).expect(200)).body).toHaveLength(2);
    await app.http().delete('/v1/me/activity').set(auth).expect(204);
    expect((await app.http().get('/v1/me/activity').set(auth).expect(200)).body).toEqual([]);
  });

  it('keeps the history private to its owner', async () => {
    const owner = await userActor(app, 'STUDENT');
    const other = await userActor(app, 'STUDENT');
    await app
      .http()
      .post('/v1/me/activity')
      .set(owner.auth)
      .send({
        deviceId: `device-${randomUUID()}`,
        entries: [{ kind: 'SEARCH', queryText: 'privé', occurredAt: new Date().toISOString() }],
      })
      .expect(204);
    expect((await app.http().get('/v1/me/activity').set(other.auth).expect(200)).body).toEqual([]);
  });
});

describe('profile', () => {
  it('edits the name and bio', async () => {
    const { auth } = await userActor(app, 'STUDENT');
    const updated = await app
      .http()
      .patch('/v1/me/profile')
      .set(auth)
      .send({ firstName: ' Amina ', bio: 'Externe en pédiatrie.' })
      .expect(200);
    expect(updated.body).toMatchObject({
      firstName: 'Amina',
      bio: 'Externe en pédiatrie.',
      avatarUrl: null,
    });
    await app
      .http()
      .patch('/v1/me/profile')
      .set(auth)
      .send({ bio: 'x'.repeat(281) })
      .expect(400);
    const cleared = await app
      .http()
      .patch('/v1/me/profile')
      .set(auth)
      .send({ bio: null })
      .expect(200);
    expect(cleared.body.bio).toBeNull();
  });

  it('re-encodes the photo without metadata and deletes the original', async () => {
    const { userId, auth } = await userActor(app, 'STUDENT');
    const original = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#3377aa' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-author' } } })
      .jpeg()
      .toBuffer();
    const start = await app
      .http()
      .post('/v1/me/photo/uploads')
      .set(auth)
      .send({ contentType: 'image/jpeg', sizeBytes: original.byteLength, sha256: sha256(original) })
      .expect(200);
    await app
      .http()
      .put(pathOf(start.body.upload.url))
      .set('Content-Type', 'image/jpeg')
      .send(original)
      .expect(200);
    const me = await app
      .http()
      .post('/v1/me/photo')
      .set(auth)
      .send({ intentId: start.body.upload.intentId, imageId: start.body.imageId })
      .expect(200);
    expect(me.body.avatarUrl).toEqual(expect.any(String));

    const stored = await app.prisma().user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.avatarStorageKey).toMatch(
      new RegExp(`^doktool/profile-images/${userId}/[0-9a-f-]+\\.webp$`),
    );
    const bytes = await app.get(StorageService).download('CONTENT', stored.avatarStorageKey!);
    const metadata = await sharp(bytes).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 512, height: 512 });
    expect(metadata.exif).toBeUndefined();
    const originalKey = `doktool/profile-images/${userId}/originals/${start.body.imageId}.jpg`;
    expect(await app.get(StorageService).head('CONTENT', originalKey)).toBeNull();

    const removed = await app.http().delete('/v1/me/photo').set(auth).expect(200);
    expect(removed.body.avatarUrl).toBeNull();
    expect(await app.get(StorageService).head('CONTENT', stored.avatarStorageKey!)).toBeNull();
  });

  it('refuses a file that is not an image', async () => {
    const { auth } = await userActor(app, 'STUDENT');
    await app
      .http()
      .post('/v1/me/photo/uploads')
      .set(auth)
      .send({ contentType: 'application/pdf', sizeBytes: 100, sha256: sha256(Buffer.from('x')) })
      .expect(400);
  });
});
