import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import type { BadgeTone } from '@/ui/badge';

/** API types used by the library pages. */
export type ReferenceDocument = Schemas['AdminReferenceDocumentDto'];
export type DocumentType = Schemas['ReferenceDocumentType'];
export type DocumentStatus = Schemas['ReferenceDocumentStatus'];
export type FileStatus = Schemas['FileProcessingStatus'];

/** URL segment of each library type (`/admin/library/{ordonnances|certificates}`, section 02). */
export const TYPE_SEGMENTS: Record<string, DocumentType> = {
  ordonnances: 'ORDONNANCE',
  certificates: 'CERTIFICATE',
};

/** URL segment of each type. */
export const SEGMENT_OF: Record<DocumentType, string> = {
  ORDONNANCE: 'ordonnances',
  CERTIFICATE: 'certificates',
};

/** Catalogue key of each type. */
export const TYPE_LABELS: Record<DocumentType, MessageKey> = {
  ORDONNANCE: 'admin.library.typeOrdonnances',
  CERTIFICATE: 'admin.library.typeCertificates',
};

/** Catalogue key of each model status. */
export const STATUS_LABELS: Record<DocumentStatus, MessageKey> = {
  PROCESSING: 'admin.library.statusProcessing',
  ENABLED: 'admin.library.statusEnabled',
  DISABLED: 'admin.library.statusDisabled',
  ARCHIVED: 'admin.library.statusArchived',
};

/** Badge colour of each model status. */
export const STATUS_TONES: Record<DocumentStatus, BadgeTone> = {
  PROCESSING: 'info',
  ENABLED: 'success',
  DISABLED: 'neutral',
  ARCHIVED: 'outline',
};

/** Catalogue key of each file processing status. */
export const FILE_STATUS_LABELS: Record<FileStatus, MessageKey> = {
  PENDING: 'admin.library.fileProcessing',
  READY: 'admin.library.fileReady',
  FAILED: 'admin.library.fileFailed',
};

/** Badge colour of each file processing status. */
export const FILE_STATUS_TONES: Record<FileStatus, BadgeTone> = {
  PENDING: 'info',
  READY: 'success',
  FAILED: 'critical',
};

/** The status chips (null = all). */
export const STATUS_FILTERS: (DocumentStatus | null)[] = [
  null,
  'ENABLED',
  'DISABLED',
  'PROCESSING',
  'ARCHIVED',
];

/** Cache key of one type's list. */
export const libraryKey = (type: DocumentType) => ['admin', 'library', type] as const;
/** Cache key of one model. */
export const documentKey = (id: string) => ['admin', 'library', 'document', id] as const;
