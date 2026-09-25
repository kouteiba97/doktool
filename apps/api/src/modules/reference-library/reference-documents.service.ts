import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ReferenceDocumentType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { AccessService, type ItemAccess } from '../access/index.js';
import { SIGNED_READ_TTL, StorageService } from '../storage/index.js';
import { compareTitles, normaliseForSearch } from './reference-library.policy.js';

export interface ReferenceItem {
  id: string;
  type: ReferenceDocumentType;
  titleFr: string;
  titleEn: string | null;
  fileVersion: number;
  pageCount: number;
  sizeBytes: number;
  sha256: string;
  /** When the current file was processed ("file date" in the viewer). */
  fileDate: Date;
  access: ItemAccess;
}

const PUBLISHED_SELECT = {
  id: true,
  type: true,
  titleFr: true,
  titleEn: true,
  demoSample: true,
  status: true,
  currentFile: {
    select: {
      version: true,
      pageCount: true,
      sizeBytes: true,
      sha256: true,
      processedAt: true,
      storageKey: true,
    },
  },
} as const;

type PublishedRow = {
  id: string;
  type: ReferenceDocumentType;
  titleFr: string;
  titleEn: string | null;
  demoSample: boolean;
  status: string;
  currentFile: {
    version: number;
    pageCount: number | null;
    sizeBytes: number;
    sha256: string | null;
    processedAt: Date | null;
    storageKey: string;
  } | null;
};

/**
 * What users see of the Reference Library (section 13): enabled models only, each with the
 * server's access decision. Disabled and archived models are gone from lists; opening one answers
 * CONTENT_UNAVAILABLE ("N'est plus disponible").
 */
@Injectable()
export class ReferenceDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
  ) {}

  /** A–Z list of one type, optionally filtered by title (accent- and case-insensitive). */
  async list(
    viewer: Viewer,
    type: ReferenceDocumentType,
    query?: string,
  ): Promise<ReferenceItem[]> {
    const rows = await this.published({ type });
    // Every word of the query must appear in one of the titles, in any order.
    const words = query ? normaliseForSearch(query).split(' ').filter(Boolean) : [];
    const matching = words.length
      ? rows.filter((row) =>
          [row.titleFr, row.titleEn ?? ''].some((title) => {
            const haystack = normaliseForSearch(title);
            return words.every((word) => haystack.includes(word));
          }),
        )
      : rows;
    return (await this.withAccess(viewer, matching)).sort(compareTitles);
  }

  async get(viewer: Viewer, id: string): Promise<ReferenceItem> {
    const row = await this.prisma.referenceDocument.findUnique({
      where: { id },
      select: PUBLISHED_SELECT,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Reference model not found.');
    if (row.status !== 'ENABLED' || !isPublished(row)) {
      throw new DomainError('CONTENT_UNAVAILABLE', 'This model is no longer available.', {
        lockReason: 'NO_LONGER_AVAILABLE',
        unlockPath: null,
      });
    }
    const [item] = await this.withAccess(viewer, [row]);
    return item!;
  }

  /** A 10-minute signed URL to the current PDF, only when the viewer's profile opens the model. */
  async fileUrl(
    viewer: Viewer,
    id: string,
  ): Promise<{ url: string; expiresAt: Date; fileVersion: number; sha256: string }> {
    const item = await this.get(viewer, id);
    if (item.access.state === 'LOCKED') {
      throw new DomainError('FEATURE_LOCKED', 'This model is locked for this account.', {
        lockReason: item.access.lockReason ?? undefined,
        unlockPath: item.access.unlockPath,
      });
    }
    const document = await this.prisma.referenceDocument.findUniqueOrThrow({
      where: { id },
      select: { currentFile: { select: { storageKey: true } } },
    });
    const ttlSeconds = SIGNED_READ_TTL.referenceDocument;
    return {
      url: await this.storage.getSignedReadUrl('CONTENT', document.currentFile!.storageKey, {
        ttlSeconds,
      }),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      fileVersion: item.fileVersion,
      sha256: item.sha256,
    };
  }

  /** Every model the viewer may open, for the offline manifest. */
  async openable(viewer: Viewer): Promise<ReferenceItem[]> {
    const items = await this.withAccess(viewer, await this.published({}));
    return items.filter((item) => item.access.state === 'AVAILABLE').sort(compareTitles);
  }

  private async published(filter: { type?: ReferenceDocumentType }): Promise<PublishedRow[]> {
    const rows = await this.prisma.referenceDocument.findMany({
      where: {
        status: 'ENABLED',
        currentFileId: { not: null },
        ...(filter.type ? { type: filter.type } : {}),
      },
      select: PUBLISHED_SELECT,
    });
    return rows.filter(isPublished);
  }

  private async withAccess(viewer: Viewer, rows: PublishedRow[]): Promise<ReferenceItem[]> {
    const { decisions } = await this.access.decideItems(
      viewer,
      rows.map((row) => ({ type: 'referenceDocuments' as const, demoSample: row.demoSample })),
    );
    return rows.map((row, index) => {
      const file = row.currentFile!;
      return {
        id: row.id,
        type: row.type,
        titleFr: row.titleFr,
        titleEn: row.titleEn,
        fileVersion: file.version,
        pageCount: file.pageCount!,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256!,
        fileDate: file.processedAt!,
        access: decisions[index]!,
      };
    });
  }
}

function isPublished(row: PublishedRow): boolean {
  const file = row.currentFile;
  return (
    file !== null && file.sha256 !== null && file.pageCount !== null && file.processedAt !== null
  );
}
