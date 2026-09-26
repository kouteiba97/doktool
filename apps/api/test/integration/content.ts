// Publishes real content through the admin API, the way Admin Web does, for tests of the user
// side (search, library). Fixtures are non-clinical (ADR-012).
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from '@cantoo/pdf-lib';
import { ReferenceProcessingService } from '../../src/modules/reference-library/reference-processing.service.js';
import type { AdminActor } from './actors.js';
import type { TestApp } from './app.js';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pathOf = (url: string) => `${new URL(url).pathname}${new URL(url).search}`;
const t = (fr: string, en: string) => ({ fr, en });

/** An enabled reference model, processed and visible to entitled users. */
export async function publishReference(
  app: TestApp,
  admin: AdminActor,
  options: {
    titleFr: string;
    titleEn?: string;
    type?: 'ORDONNANCE' | 'CERTIFICATE';
    demoSample?: boolean;
  },
): Promise<string> {
  const document = await PDFDocument.create();
  document.addPage().drawText(options.titleFr.replace(/[^\x20-\x7e]/g, '?'));
  const bytes = Buffer.from(await document.save());
  const type = options.type ?? 'ORDONNANCE';
  const start = await admin
    .post('/admin/v1/reference-documents/uploads')
    .send({ type, fileName: 'model.pdf', sizeBytes: bytes.byteLength, sha256: sha256(bytes) })
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
      ...(options.titleEn ? { titleEn: options.titleEn } : {}),
      demoSample: options.demoSample ?? false,
      status: 'ENABLED',
      reason: 'Test publication',
    })
    .expect(200);
  await app.get(ReferenceProcessingService).processPending();
  return created.body.id as string;
}

/** A published calculator (drafted by `editor`, reviewed by `reviewer`). */
export async function publishCalculator(
  editor: AdminActor,
  reviewer: AdminActor,
  options: { nameFr: string; nameEn: string; purposeFr?: string; purposeEn?: string },
): Promise<{ id: string; slug: string }> {
  const slug = `fixture-${randomUUID().slice(0, 8)}`;
  const calculator = await editor
    .post('/admin/v1/calculators')
    .send({
      slug,
      nameFr: options.nameFr,
      nameEn: options.nameEn,
      purposeFr: options.purposeFr,
      purposeEn: options.purposeEn,
      accessTier: 'STUDENT',
      demoSample: false,
      reason: 'New tool',
    })
    .expect(200);
  const definition = {
    schemaVersion: 1,
    inputs: [
      {
        kind: 'NUMBER',
        key: 'side',
        label: t('Côté', 'Side'),
        required: true,
        quantity: 'LENGTH',
        canonicalUnit: 'm',
        decimals: 2,
        hardRange: { min: 0 },
        validatedRange: { min: 0.1, max: 100 },
      },
    ],
    formula: { op: 'mul', args: [{ input: 'side' }, { input: 'side' }] },
    result: { unit: 'm²', decimals: 2, label: t('Surface', 'Area') },
    limitations: t('Fixture de test, non clinique.', 'Test fixture, not clinical.'),
  };
  const version = await editor
    .post(`/admin/v1/calculators/${calculator.body.id}/versions`)
    .send({ definition })
    .expect(200);
  const versionId = version.body.id as string;
  await editor
    .post(`/admin/v1/calculators/versions/${versionId}/sources`)
    .send({
      role: 'PRIMARY',
      authors: 'Test Author',
      title: 'Test source',
      publisher: 'Test Publisher',
      year: 2024,
      formulaLocation: 'p. 1',
      accessedAt: '2026-09-20',
    })
    .expect(200);
  await editor
    .post(`/admin/v1/calculators/versions/${versionId}/test-cases`)
    .send({
      inputs: { side: { value: 2 } },
      expectedOutcome: 'RESULT',
      expectedValue: 4,
      tolerance: 1e-9,
      origin: 'Worked example',
    })
    .expect(200);
  await editor.post(`/admin/v1/calculators/versions/${versionId}/test-run`).expect(200);
  await editor.post(`/admin/v1/calculators/versions/${versionId}/submit`).expect(200);
  await reviewer
    .post(`/admin/v1/calculators/versions/${versionId}/publish`)
    .send({ reviewNote: 'Checked against the source' })
    .expect(200);
  return { id: calculator.body.id as string, slug };
}
