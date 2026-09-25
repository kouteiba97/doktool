// Phase 5 exit criteria on the local driver: no object is reachable without a signed URL, signed
// URLs expire, and uploads are checked before use (ADR-011).
import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  StorageKeys,
  StorageService,
  UploadIntentsService,
} from '../../src/modules/storage/index.js';
import { useTestApp } from './app.js';

const app = useTestApp();
const admin = { type: 'ADMIN' as const, id: randomUUID() };

const pdf = (text: string) => Buffer.from(`%PDF-1.7\n${text}\n%%EOF\n`);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
/** Supertest needs the path and query of a signed URL, not its host. */
const pathOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};

async function ticketFor(bytes: Buffer, contentType = 'application/pdf') {
  const hash = sha256(bytes);
  return app.get(UploadIntentsService).create({
    purpose: 'REFERENCE_DOCUMENT',
    key: StorageKeys.referenceDocument('ORDONNANCE', randomUUID(), 1, hash),
    contentType,
    sizeBytes: bytes.byteLength,
    sha256: hash,
    requestedBy: admin,
  });
}

const put = (url: string, bytes: Buffer, contentType = 'application/pdf') =>
  app.http().put(pathOf(url)).set('Content-Type', contentType).send(bytes);

describe('signed uploads', () => {
  it('uploads through the signed URL, confirms, and serves it through a signed read URL', async () => {
    const bytes = pdf('ordonnance angine');
    const ticket = await ticketFor(bytes);
    expect(ticket).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.byteLength) },
    });

    await put(ticket.url, bytes).expect(200);
    const stored = await app.get(UploadIntentsService).confirm(ticket.intentId, admin);
    expect(stored).toMatchObject({
      bucket: 'CONTENT',
      key: ticket.key,
      sizeBytes: bytes.byteLength,
      declaredSha256: sha256(bytes),
    });

    const readUrl = await app
      .get(StorageService)
      .getSignedReadUrl('CONTENT', ticket.key, { ttlSeconds: 600 });
    const read = await app.http().get(pathOf(readUrl)).expect(200);
    expect(read.headers['content-type']).toBe('application/pdf');
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(read.body as Buffer).equals(bytes)).toBe(true);
  });

  it('refuses an upload of another size or type than signed', async () => {
    const bytes = pdf('exact size');
    const ticket = await ticketFor(bytes);
    await put(ticket.url, Buffer.concat([bytes, Buffer.from('extra')])).expect(403);
    await put(ticket.url, bytes, 'image/png').expect(403);
  });

  it('rejects and deletes a file whose bytes are not what was declared', async () => {
    const fake = Buffer.from('this is not a pdf at all');
    const ticket = await ticketFor(fake);
    await put(ticket.url, fake).expect(200);
    await expect(
      app.get(UploadIntentsService).confirm(ticket.intentId, admin),
    ).rejects.toMatchObject({
      code: 'UPLOAD_INVALID',
    });
    expect(await app.get(StorageService).head('CONTENT', ticket.key)).toBeNull();
  });

  it('confirms only for the requester, once, and only after the upload', async () => {
    const bytes = pdf('once');
    const ticket = await ticketFor(bytes);
    const intents = app.get(UploadIntentsService);
    await expect(intents.confirm(ticket.intentId, admin)).rejects.toMatchObject({
      code: 'UPLOAD_INVALID',
    });
    await put(ticket.url, bytes).expect(200);
    await expect(
      intents.confirm(ticket.intentId, { type: 'ADMIN', id: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await intents.confirm(ticket.intentId, admin);
    await expect(intents.confirm(ticket.intentId, admin)).rejects.toMatchObject({
      code: 'UPLOAD_INVALID',
    });
  });

  it('refuses an oversized declaration and unknown types up front', async () => {
    const intents = app.get(UploadIntentsService);
    const base = {
      purpose: 'REFERENCE_DOCUMENT' as const,
      key: StorageKeys.referenceDocument('CERTIFICATE', randomUUID(), 1, 'b'.repeat(64)),
      sha256: 'b'.repeat(64),
      requestedBy: admin,
    };
    await expect(
      intents.create({ ...base, contentType: 'application/pdf', sizeBytes: 21 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      intents.create({ ...base, contentType: 'text/html', sizeBytes: 10 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('keeps keys immutable', async () => {
    const bytes = pdf('immutable');
    const ticket = await ticketFor(bytes);
    await put(ticket.url, bytes).expect(200);
    await put(ticket.url, bytes).expect(422);
  });

  it('purges expired, unconfirmed uploads and their objects', async () => {
    const bytes = pdf('abandoned');
    const ticket = await ticketFor(bytes);
    await put(ticket.url, bytes).expect(200);
    await app.prisma().storageUploadIntent.update({
      where: { id: ticket.intentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      app.get(UploadIntentsService).confirm(ticket.intentId, admin),
    ).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });

    await app.get(UploadIntentsService).purgeExpired();
    expect(await app.get(StorageService).head('CONTENT', ticket.key)).toBeNull();
    expect(await app.prisma().storageUploadIntent.count({ where: { id: ticket.intentId } })).toBe(
      0,
    );
  });
});

describe('no public object (audit §8, Lock L43)', () => {
  it('serves nothing without a valid, unexpired signature', async () => {
    const bytes = pdf('private');
    const ticket = await ticketFor(bytes);
    await put(ticket.url, bytes).expect(200);
    const storage = app.get(StorageService);

    await app.http().get('/v1/storage/local/objects').expect(403);
    await app.http().get('/v1/storage/local/objects?token=forged.token').expect(403);

    const expired = await storage.getSignedReadUrl('CONTENT', ticket.key, { ttlSeconds: -1 });
    await app.http().get(pathOf(expired)).expect(403);

    const uploadUrlUsedForReading = ticket.url;
    await app.http().get(pathOf(uploadUrlUsedForReading)).expect(403);

    // The storage folder is not served statically.
    await app.http().get(`/${ticket.key}`).expect(404);
    await app.http().get(`/.storage/content/${ticket.key}`).expect(404);
  });
});
