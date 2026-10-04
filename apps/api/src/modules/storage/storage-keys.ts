// Object key layout (audit §8). Keys are immutable and never reused.
import type { ReferenceDocumentType } from '../../generated/prisma/enums.js';

/** Same rule as the `storage_upload_intents_key_chk` constraint. */
export const STORAGE_KEY_PATTERN = /^doktool\/[A-Za-z0-9/_.-]+$/;

export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key) && !key.includes('..') && !key.includes('//');
}

const REFERENCE_FOLDERS: Record<ReferenceDocumentType, string> = {
  ORDONNANCE: 'ordonnances',
  CERTIFICATE: 'certificates',
};

const SHA256 = /^[0-9a-f]{64}$/;

export const StorageKeys = {
  /** doktool/reference-documents/{ordonnances|certificates}/{documentId}/v{n}-{sha8}.pdf */
  referenceDocument(
    type: ReferenceDocumentType,
    documentId: string,
    version: number,
    sha256: string,
  ) {
    if (!SHA256.test(sha256)) throw new Error('A reference document key needs the file SHA-256');
    return `doktool/reference-documents/${REFERENCE_FOLDERS[type]}/${documentId}/v${version}-${sha256.slice(0, 8)}.pdf`;
  },

  /** doktool/verification/{userId}/{caseId}/{documentId}.{ext} — private bucket only. */
  verificationDocument(
    userId: string,
    caseId: string,
    documentId: string,
    extension: 'jpg' | 'png' | 'pdf',
  ) {
    return `doktool/verification/${userId}/${caseId}/${documentId}.${extension}`;
  },

  /** doktool/recovery/{requestId}/{slot}-{uuid}.{jpg|png} — private bucket only (ADR-023). */
  recoveryDocument(
    requestId: string,
    slot: 'identity' | 'selfie',
    fileId: string,
    extension: 'jpg' | 'png',
  ) {
    return `doktool/recovery/${requestId}/${slot}-${fileId}.${extension}`;
  },

  /** doktool/profile-images/{userId}/originals/{uuid}.{jpg|png} — deleted once re-encoded. */
  profileImageOriginal(userId: string, imageId: string, extension: 'jpg' | 'png') {
    return `doktool/profile-images/${userId}/originals/${imageId}.${extension}`;
  },

  /** doktool/profile-images/{userId}/{uuid}.webp */
  profileImage(userId: string, imageId: string) {
    return `doktool/profile-images/${userId}/${imageId}.webp`;
  },
} as const;
