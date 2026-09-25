// Phase 6 exit criterion: upload → enable → visible to entitled users → replace keeps id → audit rows.
import { PDFDocument } from '@cantoo/pdf-lib';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { ReferenceProcessingService } from '../../src/modules/reference-library/reference-processing.service.js';
import { type AdminActor, adminActor, demoActor, userActor } from './actors.js';
import { useTestApp } from './app.js';

const app = useTestApp();
let admin: AdminActor;

beforeAll(async () => {
  admin = await adminActor(app);
});

async function pdfWithPages(pages: number, label: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i++) document.addPage().drawText(`${label} — page ${i + 1}`);
  return Buffer.from(await document.save());
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pathOf = (url: string) => `${new URL(url).pathname}${new URL(url).search}`;
/** Runs the processing job inline (jobs are disabled in tests). */
const processUploads = () => app.get(ReferenceProcessingService).processPending();

/** Upload + create through the admin API, the way Admin Web does it. */
async function publish(options: {
  titleFr: string;
  type?: 'ORDONNANCE' | 'CERTIFICATE';
  demoSample?: boolean;
  status?: 'ENABLED' | 'DISABLED';
  bytes?: Buffer;
  declaredSha?: string;
}) {
  const bytes = options.bytes ?? (await pdfWithPages(2, options.titleFr));
  const type = options.type ?? 'ORDONNANCE';
  const start = await admin
    .post('/admin/v1/reference-documents/uploads')
    .send({
      type,
      fileName: `${options.titleFr}.pdf`,
      sizeBytes: bytes.byteLength,
      sha256: options.declaredSha ?? sha256(bytes),
    })
    .expect(200);
  await app
    .http()
    .put(pathOf(start.body.upload.url))
    .set('Content-Type', 'application/pdf')
    .send(bytes)
    .expect(200);
  const created = await admin
    .post('/admin/v1/reference-documents')
    .send({
      intentId: start.body.upload.intentId,
      documentId: start.body.documentId,
      type,
      titleFr: options.titleFr,
      demoSample: options.demoSample ?? false,
      status: options.status ?? 'ENABLED',
      reason: 'Initial publication',
    })
    .expect(200);
  return { id: created.body.id as string, created: created.body, start: start.body, bytes };
}

const listFor = async (auth: Record<string, string>, type = 'ORDONNANCE', q?: string) =>
  (
    await app
      .http()
      .get('/v1/reference-documents')
      .query({ type, ...(q ? { q } : {}) })
      .set(auth)
      .expect(200)
  ).body as {
    id: string;
    access: { state: string; lockReason: string | null };
  }[];

describe('reference model lifecycle', () => {
  it('uploads, processes, serves entitled users, replaces under the same id and audits each step', async () => {
    const title = `Angine de l'adulte ${randomUUID().slice(0, 6)}`;
    const { id, created, start } = await publish({ titleFr: title });
    expect(start.suggestedTitle).toBe(title);
    expect(created).toMatchObject({
      status: 'PROCESSING',
      statusAfterProcessing: 'ENABLED',
      currentFile: null,
    });

    await processUploads();
    const processed = (await admin.get(`/admin/v1/reference-documents/${id}`).expect(200)).body;
    expect(processed).toMatchObject({
      status: 'ENABLED',
      currentFile: { version: 1, pageCount: 2, processingStatus: 'READY' },
    });

    const professional = await userActor(app, 'PROFESSIONAL');
    const item = (await listFor(professional.auth)).find((row) => row.id === id);
    expect(item?.access).toEqual({ state: 'AVAILABLE', lockReason: null, unlockPath: null });
    const file = await app
      .http()
      .get(`/v1/reference-documents/${id}/file-url`)
      .set(professional.auth)
      .expect(200);
    const pdf = await app.http().get(pathOf(file.body.url)).expect(200);
    expect(
      Buffer.from(pdf.body as Buffer)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');

    // Replace: new version, same id; users keep version 1 until version 2 is processed.
    const replacement = await pdfWithPages(3, `${title} v2`);
    const next = await admin
      .post(`/admin/v1/reference-documents/${id}/replacement-uploads`)
      .send({ fileName: 'v2.pdf', sizeBytes: replacement.byteLength, sha256: sha256(replacement) })
      .expect(200);
    expect(next.body).toMatchObject({ documentId: id, version: 2 });
    await app
      .http()
      .put(pathOf(next.body.upload.url))
      .set('Content-Type', 'application/pdf')
      .send(replacement)
      .expect(200);
    await admin
      .post(`/admin/v1/reference-documents/${id}/files`)
      .send({ intentId: next.body.upload.intentId, version: 2, reason: 'Updated guideline 2026' })
      .expect(200);
    expect(
      (await app.http().get(`/v1/reference-documents/${id}`).set(professional.auth).expect(200))
        .body.fileVersion,
    ).toBe(1);

    await processUploads();
    const replaced = (await admin.get(`/admin/v1/reference-documents/${id}`).expect(200)).body;
    expect(replaced.id).toBe(id);
    expect(replaced.currentFile).toMatchObject({ version: 2, pageCount: 3 });
    expect(replaced.files.map((f: { version: number }) => f.version)).toEqual([2, 1]);
    expect(
      (await app.http().get(`/v1/reference-documents/${id}`).set(professional.auth).expect(200))
        .body.fileVersion,
    ).toBe(2);

    const audit = await app.prisma().auditLogEntry.findMany({
      where: { OR: [{ entityId: id }, { after: { path: ['documentId'], equals: id } }] },
      orderBy: { id: 'asc' },
      select: { action: true, actorType: true, reason: true },
    });
    expect(audit).toEqual([
      { action: 'reference.created', actorType: 'ADMIN', reason: 'Initial publication' },
      { action: 'reference.file.processed', actorType: 'SYSTEM', reason: null },
      { action: 'reference.file.replaced', actorType: 'ADMIN', reason: 'Updated guideline 2026' },
      { action: 'reference.file.processed', actorType: 'SYSTEM', reason: null },
    ]);
  });

  it('shows locked models with their reason, and opens demo samples to students and demo', async () => {
    const tag = randomUUID().slice(0, 6);
    const regular = await publish({ titleFr: `Certificat de sport ${tag}`, type: 'CERTIFICATE' });
    const sample = await publish({
      titleFr: `Arrêt de travail ${tag}`,
      type: 'CERTIFICATE',
      demoSample: true,
    });
    await processUploads();

    const student = await userActor(app, 'STUDENT');
    const unpaid = await userActor(app, 'PROFESSIONAL_UNPAID');
    const demo = await demoActor(app);
    const decision = async (auth: Record<string, string>, id: string) =>
      (await listFor(auth, 'CERTIFICATE', tag)).find((row) => row.id === id)?.access;

    expect(await decision(student.auth, regular.id)).toMatchObject({
      state: 'LOCKED',
      lockReason: 'PROFESSIONAL_ONLY',
    });
    expect(await decision(student.auth, sample.id)).toMatchObject({ state: 'AVAILABLE' });
    expect(await decision(unpaid.auth, regular.id)).toMatchObject({
      state: 'LOCKED',
      lockReason: 'SUBSCRIPTION_REQUIRED',
    });
    expect(await decision(demo.auth, regular.id)).toMatchObject({
      state: 'LOCKED',
      lockReason: 'DEMO_LIMIT',
    });
    expect(await decision(demo.auth, sample.id)).toMatchObject({ state: 'AVAILABLE' });

    const refused = await app
      .http()
      .get(`/v1/reference-documents/${regular.id}/file-url`)
      .set(student.auth)
      .expect(403);
    expect(refused.body.error).toMatchObject({
      code: 'FEATURE_LOCKED',
      details: { lockReason: 'PROFESSIONAL_ONLY', unlockPath: null },
    });
    await app
      .http()
      .get(`/v1/reference-documents/${sample.id}/file-url`)
      .set(demo.auth)
      .expect(200);
  });

  it('hides disabled and archived models from users and default admin views', async () => {
    const { id } = await publish({ titleFr: `Otite ${randomUUID().slice(0, 6)}` });
    await processUploads();
    const professional = await userActor(app, 'PROFESSIONAL');

    await admin
      .post(`/admin/v1/reference-documents/${id}/disable`)
      .send({ reason: 'Under clinical review' })
      .expect(200);
    expect((await listFor(professional.auth)).some((row) => row.id === id)).toBe(false);
    const gone = await app
      .http()
      .get(`/v1/reference-documents/${id}`)
      .set(professional.auth)
      .expect(410);
    expect(gone.body.error).toMatchObject({
      code: 'CONTENT_UNAVAILABLE',
      details: { lockReason: 'NO_LONGER_AVAILABLE' },
    });

    await admin
      .post(`/admin/v1/reference-documents/${id}/archive`)
      .send({ reason: 'Superseded' })
      .expect(200);
    const defaultView = (await admin.get('/admin/v1/reference-documents').expect(200)).body as {
      id: string;
    }[];
    expect(defaultView.some((row) => row.id === id)).toBe(false);
    const archivedView = (
      await admin.get('/admin/v1/reference-documents?status=ARCHIVED').expect(200)
    ).body as { id: string }[];
    expect(archivedView.some((row) => row.id === id)).toBe(true);

    const invalid = await admin
      .post(`/admin/v1/reference-documents/${id}/enable`)
      .send({ reason: 'Try' })
      .expect(409);
    expect(invalid.body.error.code).toBe('INVALID_STATE');
    await admin
      .post(`/admin/v1/reference-documents/${id}/restore`)
      .send({ reason: 'Archived by mistake' })
      .expect(200);
    await admin
      .post(`/admin/v1/reference-documents/${id}/enable`)
      .send({ reason: 'Back in use' })
      .expect(200);
    expect((await listFor(professional.auth)).some((row) => row.id === id)).toBe(true);
  });

  it('edits display metadata only, with a reason and a before/after audit', async () => {
    const { id } = await publish({ titleFr: `Sinusite ${randomUUID().slice(0, 6)}` });
    await admin
      .patch(`/admin/v1/reference-documents/${id}`)
      .send({ titleEn: 'Sinusitis' })
      .expect(400);
    const edited = await admin
      .patch(`/admin/v1/reference-documents/${id}`)
      .send({ titleEn: 'Sinusitis', demoSample: true, reason: 'English title' })
      .expect(200);
    expect(edited.body).toMatchObject({ titleEn: 'Sinusitis', demoSample: true });
    const entry = await app
      .prisma()
      .auditLogEntry.findFirstOrThrow({ where: { entityId: id, action: 'reference.updated' } });
    expect(entry.before).toMatchObject({ titleEn: null, demoSample: false });
    expect(entry.after).toMatchObject({ titleEn: 'Sinusitis', demoSample: true });
  });

  it('finds titles regardless of accents and case', async () => {
    const tag = randomUUID().slice(0, 6);
    const { id } = await publish({ titleFr: `Céphalée de tension ${tag}` });
    await processUploads();
    const professional = await userActor(app, 'PROFESSIONAL');
    expect(
      (await listFor(professional.auth, 'ORDONNANCE', `CEPHALEE ${tag}`)).map((row) => row.id),
    ).toEqual([id]);
  });
});

describe('upload safety', () => {
  it('refuses a file that is not a PDF', async () => {
    const fake = Buffer.from('<html>not a pdf</html>');
    const start = await admin
      .post('/admin/v1/reference-documents/uploads')
      .send({
        type: 'ORDONNANCE',
        fileName: 'fake.pdf',
        sizeBytes: fake.byteLength,
        sha256: sha256(fake),
      })
      .expect(200);
    await app
      .http()
      .put(pathOf(start.body.upload.url))
      .set('Content-Type', 'application/pdf')
      .send(fake)
      .expect(200);
    const refused = await admin
      .post('/admin/v1/reference-documents')
      .send({
        intentId: start.body.upload.intentId,
        documentId: start.body.documentId,
        type: 'ORDONNANCE',
        titleFr: 'Fake',
        demoSample: false,
        status: 'ENABLED',
        reason: 'Test',
      })
      .expect(422);
    expect(refused.body.error.code).toBe('UPLOAD_INVALID');
  });

  it('marks a file whose checksum differs from the declaration as failed and keeps the model disabled', async () => {
    const bytes = await pdfWithPages(1, 'tampered');
    const { id } = await publish({
      titleFr: `Tampered ${randomUUID().slice(0, 6)}`,
      bytes,
      declaredSha: 'c'.repeat(64),
    });
    await processUploads();
    const detail = (await admin.get(`/admin/v1/reference-documents/${id}`).expect(200)).body;
    expect(detail).toMatchObject({ status: 'DISABLED', currentFile: null });
    expect(detail.files[0]).toMatchObject({
      processingStatus: 'FAILED',
      processingError: expect.stringMatching(/checksum/),
    });
  });

  it('requires library grants', async () => {
    const analyst = await adminActor(app, 'ANALYST');
    const refused = await analyst.get('/admin/v1/reference-documents').expect(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
    const manager = await adminActor(app, 'LIBRARY_MANAGER');
    await manager.get('/admin/v1/reference-documents').expect(200);
  });
});

describe('offline manifest', () => {
  it('lists what the profile opens, and is locked for unpaid professionals', async () => {
    const { id } = await publish({ titleFr: `Manifest ${randomUUID().slice(0, 6)}` });
    await processUploads();
    const professional = await userActor(app, 'PROFESSIONAL');
    const manifest = await app
      .http()
      .get('/v1/offline/manifest')
      .set(professional.auth)
      .expect(200);
    expect(manifest.body.dataVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(
      manifest.body.referenceDocuments.find((entry: { id: string }) => entry.id === id),
    ).toMatchObject({
      fileVersion: 1,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const student = await userActor(app, 'STUDENT');
    const studentManifest = await app
      .http()
      .get('/v1/offline/manifest')
      .set(student.auth)
      .expect(200);
    expect(
      studentManifest.body.referenceDocuments.some((entry: { id: string }) => entry.id === id),
    ).toBe(false);

    const unpaid = await userActor(app, 'PROFESSIONAL_UNPAID');
    const locked = await app.http().get('/v1/offline/manifest').set(unpaid.auth).expect(403);
    expect(locked.body.error).toMatchObject({
      code: 'FEATURE_LOCKED',
      details: { lockReason: 'SUBSCRIPTION_REQUIRED' },
    });
  });
});
