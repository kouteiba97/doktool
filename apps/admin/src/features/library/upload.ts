import type { Schemas } from '@/api/client';

/** Same limits as the API's REFERENCE_DOCUMENT storage policy (checked again server-side). */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_TYPE = 'application/pdf';

/** Display title proposed from the file name, as the API does: "angine_adulte-v2.pdf" → "angine adulte v2". */
export function suggestTitle(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export type PdfProblem = 'type' | 'size' | 'empty';

/** Why a picked file cannot be uploaded as a reference model, or null. */
export function pdfProblem(file: { name: string; type: string; size: number }): PdfProblem | null {
  const isPdf = file.type === PDF_TYPE || (file.type === '' && /\.pdf$/i.test(file.name));
  if (!isPdf) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > PDF_MAX_BYTES) return 'size';
  return null;
}

/** Lowercase hex SHA-256 of the file, declared before upload and verified by the API. */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class UploadFailed extends Error {
  constructor(readonly status: number) {
    super(`Upload failed with HTTP ${status}`);
    this.name = 'UploadFailed';
  }
}

/**
 * Sends the bytes to the signed URL (R2, or the API's local driver in development). The browser
 * sets Content-Length itself; Content-Type must match the signature.
 */
export async function putSigned(ticket: Schemas['UploadTicketDto'], file: Blob): Promise<void> {
  const response = await fetch(ticket.url, {
    method: ticket.method,
    headers: { 'Content-Type': ticket.headers['Content-Type'] },
    body: file,
    credentials: 'omit',
  });
  if (!response.ok) throw new UploadFailed(response.status);
}
