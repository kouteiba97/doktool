// Storage limits and URL lifetimes (audit §8, ADR-011).
import type { UploadPurpose } from '../../generated/prisma/enums.js';
import type { BucketId } from './storage.service.js';

/** Signed read URL lifetimes, in seconds. */
export const SIGNED_READ_TTL = {
  referenceDocument: 10 * 60,
  profileImage: 60 * 60,
  verificationDocument: 60,
  recoveryDocument: 60,
} as const;

/** A direct upload must happen within this delay. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

const MB = 1024 * 1024;

/** The first bytes a file type always starts with ("magic number"). */
interface FileSignature {
  contentType: string;
  /** Leading bytes the file must start with. */
  magic: number[];
}

const PDF: FileSignature = {
  contentType: 'application/pdf',
  magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
}; // %PDF-
const JPEG: FileSignature = { contentType: 'image/jpeg', magic: [0xff, 0xd8, 0xff] };
const PNG: FileSignature = {
  contentType: 'image/png',
  magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** Where an upload purpose goes, how big it may be and which file types it accepts. */
export interface UploadRule {
  bucket: BucketId;
  keyPrefix: string;
  maxBytes: number;
  signatures: FileSignature[];
}

/** Rules of each kind of upload. */
export const UPLOAD_RULES: Record<UploadPurpose, UploadRule> = {
  REFERENCE_DOCUMENT: {
    bucket: 'CONTENT',
    keyPrefix: 'doktool/reference-documents/',
    maxBytes: 20 * MB,
    signatures: [PDF],
  },
  /** The original photo; the API re-encodes it (WebP, 512 px, no metadata) and deletes it. */
  PROFILE_IMAGE: {
    bucket: 'CONTENT',
    keyPrefix: 'doktool/profile-images/',
    maxBytes: 8 * MB,
    signatures: [JPEG, PNG],
  },
  VERIFICATION_DOCUMENT: {
    bucket: 'PRIVATE',
    keyPrefix: 'doktool/verification/',
    maxBytes: 10 * MB,
    signatures: [JPEG, PNG, PDF],
  },
  /** Identity photo and selfie of an account recovery (ADR-023): photos only. */
  RECOVERY_DOCUMENT: {
    bucket: 'PRIVATE',
    keyPrefix: 'doktool/recovery/',
    maxBytes: 10 * MB,
    signatures: [JPEG, PNG],
  },
};

/** Longest magic number, i.e. how many leading bytes confirmation reads. */
export const SIGNATURE_PROBE_BYTES = 8;

/** True when the first bytes match the declared file type. */
export function matchesSignature(rule: UploadRule, contentType: string, head: Uint8Array): boolean {
  const signature = rule.signatures.find((candidate) => candidate.contentType === contentType);
  return signature !== undefined && signature.magic.every((byte, index) => head[index] === byte);
}

/** True when the purpose accepts this file type. */
export function allowsContentType(rule: UploadRule, contentType: string): boolean {
  return rule.signatures.some((signature) => signature.contentType === contentType);
}
