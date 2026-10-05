import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import {
  CalculatorsService,
  type PublishedTestCase,
  type PublishedVersion,
} from '../calculators/index.js';
import { PregnancyService, type SubstanceProfile } from '../pregnancy/index.js';
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

export interface ManifestCalculator {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  category: string | null;
  published: PublishedVersion;
  /** Run by the device before first use of this version (ADR-003). */
  testCases: PublishedTestCase[];
}

export interface OfflineManifest {
  generatedAt: Date;
  /** Changes whenever any entitled file or calculator version changes ("update available"). */
  dataVersion: string;
  referenceDocuments: ManifestReference[];
  calculators: ManifestCalculator[];
  /** Pregnancy · lactation profiles the account opens, in full (ADR-019). */
  substances: SubstanceProfile[];
}

/**
 * What an account may keep on its device (audit Appendix A, Lock L44): the reference PDFs, the
 * published calculator versions and the pregnancy · lactation profiles its profile opens. The app diff-syncs against this list and
 * deletes anything no longer listed.
 */
@Injectable()
export class OfflineService {
  constructor(
    private readonly references: ReferenceDocumentsService,
    private readonly calculators: CalculatorsService,
    private readonly pregnancy: PregnancyService,
  ) {}

  async manifest(viewer: Viewer): Promise<OfflineManifest> {
    const [referenceItems, calculatorItems, substances] = await Promise.all([
      this.references.openable(viewer),
      this.calculators.openable(viewer),
      this.pregnancy.openable(viewer),
    ]);
    const referenceDocuments = referenceItems.map((item): ManifestReference => ({
      id: item.id,
      type: item.type,
      titleFr: item.titleFr,
      titleEn: item.titleEn,
      fileVersion: item.fileVersion,
      sha256: item.sha256,
      sizeBytes: item.sizeBytes,
      pageCount: item.pageCount,
      updatedAt: item.fileDate,
    }));
    const calculators = calculatorItems.map((item): ManifestCalculator => ({
      id: item.id,
      slug: item.slug,
      nameFr: item.nameFr,
      nameEn: item.nameEn,
      category: item.category,
      published: item.published,
      testCases: item.testCases,
    }));
    const fingerprint = [
      ...referenceDocuments.map((entry) => `ref:${entry.id}:${entry.fileVersion}:${entry.sha256}`),
      ...calculators.map(
        (entry) =>
          `calc:${entry.id}:${entry.published.version}:${entry.published.definitionSha256}`,
      ),
      ...substances.map((entry) => `sub:${entry.id}:${entry.version}`),
    ]
      .sort()
      .join('\n');
    return {
      generatedAt: new Date(),
      dataVersion: createHash('sha256').update(fingerprint).digest('hex').slice(0, 16),
      referenceDocuments,
      calculators,
      substances,
    };
  }
}
