import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { type ReferenceItem, ReferenceDocumentsService } from '../reference-library/index.js';

export interface ManifestReference {
  id: string;
  type: ReferenceItem['type'];
  titleFr: string;
  titleEn: string | null;
  fileVersion: number;
  sha256: string;
  sizeBytes: number;
  pageCount: number;
  updatedAt: Date;
}

export interface OfflineManifest {
  generatedAt: Date;
  /** Changes whenever any entitled file changes; the app compares it to show "update available". */
  dataVersion: string;
  referenceDocuments: ManifestReference[];
}

/**
 * What an account may keep on its device (audit Appendix A, Lock L44): the reference PDFs its
 * profile opens. Calculator versions join in Phase 7. The app diff-syncs against this list and
 * deletes anything no longer listed.
 */
@Injectable()
export class OfflineService {
  constructor(private readonly references: ReferenceDocumentsService) {}

  async manifest(viewer: Viewer): Promise<OfflineManifest> {
    const referenceDocuments = (await this.references.openable(viewer)).map(
      (item): ManifestReference => ({
        id: item.id,
        type: item.type,
        titleFr: item.titleFr,
        titleEn: item.titleEn,
        fileVersion: item.fileVersion,
        sha256: item.sha256,
        sizeBytes: item.sizeBytes,
        pageCount: item.pageCount,
        updatedAt: item.fileDate,
      }),
    );
    const fingerprint = referenceDocuments
      .map((entry) => `${entry.id}:${entry.fileVersion}:${entry.sha256}`)
      .sort()
      .join('\n');
    return {
      generatedAt: new Date(),
      dataVersion: createHash('sha256').update(fingerprint).digest('hex').slice(0, 16),
      referenceDocuments,
    };
  }
}
