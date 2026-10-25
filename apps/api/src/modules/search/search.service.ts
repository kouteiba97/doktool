import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { SearchEntityType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import type { ItemAccess } from '../access/index.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { CalculatorsService } from '../calculators/index.js';
import { PregnancyService } from '../pregnancy/index.js';
import { ReferenceDocumentsService } from '../reference-library/index.js';
import {
  intentOf,
  normalize,
  score,
  SEARCH_TYPES,
  type SearchEntry,
  type SearchType,
  suggestions,
  withoutIntent,
} from './ranking.js';

/** One result of the global search. */
export interface SearchHit {
  type: SearchType;
  id: string;
  /** Calculators open by slug. */
  slug: string | null;
  titleFr: string;
  titleEn: string | null;
  purposeFr: string | null;
  purposeEn: string | null;
  access: ItemAccess;
  /** Other names the item is found by (substance synonyms); not returned to the app. */
  terms?: string[];
}

/** Results of one type (ordonnances, certificates, calculators, pregnancy). */
export interface SearchGroup {
  type: SearchType;
  total: number;
  hits: SearchHit[];
}

/** The grouped results and, when nothing matched, suggestions. */
export interface SearchResult {
  groups: SearchGroup[];
  /** « Vouliez-vous dire » titles, only when nothing matched. */
  suggestions: string[];
}

/** Rows shown per group in the grouped view; a type filter shows up to the full limit. */
const GROUP_PREVIEW = 3;
const TYPE_LIMIT = 50;
const SEARCH_RATE = { name: 'search', limit: 120, windowSeconds: 60 };
const SYNONYM_CACHE_MS = 60_000;
const MAX_SYNONYMS = 30;

/**
 * The V1 search index (section 12) over enabled reference models and published calculators.
 * Results keep locked items in place with the server's access decision (never hidden, Lock L38).
 * The query text is never stored or logged (Lock L42).
 */
@Injectable()
export class SearchService {
  private synonymCache: { at: number; byEntity: Map<string, string[]> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceDocumentsService,
    private readonly calculators: CalculatorsService,
    private readonly pregnancy: PregnancyService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  /**
   * Global search: rate limit, detect the category asked for, score every candidate, group by type
   * (best group first), suggest titles when nothing matched.
   */
  async search(viewer: Viewer, query: string, type?: SearchType): Promise<SearchResult> {
    await this.limiter.hit(
      SEARCH_RATE,
      viewer.accessContext === 'DEMO' ? `demo:${viewer.demoSessionId}` : `user:${viewer.userId}`,
    );
    if (!normalize(query)) return { groups: [], suggestions: [] };

    const intent = intentOf(query);
    const matchQuery = intent ? withoutIntent(query, intent) : query;
    const synonyms = await this.synonyms();
    const candidates = await this.candidates(viewer, type);
    const scored = candidates
      .map((hit) => {
        const entry = this.entryOf(hit, synonyms);
        return { hit, entry, score: score(matchQuery, entry) };
      })
      .filter((item): item is typeof item & { score: number } => item.score !== null);

    const groups: (SearchGroup & { best: number })[] = [];
    for (const groupType of SEARCH_TYPES) {
      if (type && groupType !== type) continue;
      const matching = scored
        .filter((item) => item.hit.type === groupType)
        .sort((a, b) => b.score - a.score || a.hit.titleFr.localeCompare(b.hit.titleFr, 'fr'));
      if (matching.length === 0) continue;
      groups.push({
        type: groupType,
        total: matching.length,
        hits: matching.slice(0, type ? TYPE_LIMIT : GROUP_PREVIEW).map((item) => item.hit),
        best: matching[0]!.score + (groupType === intent ? 10_000 : 0),
      });
    }
    groups.sort((a, b) => b.best - a.best);

    return {
      groups: groups.map(({ best: _best, ...group }) => group),
      suggestions:
        groups.length > 0
          ? []
          : suggestions(
              query,
              candidates.map((hit) => ({ title: hit.titleFr, entry: this.entryOf(hit, synonyms) })),
            ),
    };
  }

  // ───────────────────────────── admin synonyms ─────────────────────────────

  /** Synonyms as Admin Web reads them (grant `library.read` or `calculators.read`). */
  async synonymsFor(
    admin: AdminPrincipal,
    entityType: SearchEntityType,
    entityId: string,
  ): Promise<string[]> {
    const grant = entityType === 'CALCULATOR' ? 'calculators.read' : 'library.read';
    if (!admin.grants.includes(grant)) {
      throw new DomainError('FORBIDDEN', `Reading these synonyms needs the ${grant} grant.`);
    }
    return this.synonymsOf(entityType, entityId);
  }

  /** The synonyms of one model or calculator, A–Z. */
  private async synonymsOf(entityType: SearchEntityType, entityId: string): Promise<string[]> {
    const rows = await this.prisma.searchSynonym.findMany({
      where: { entityType, entityId },
      orderBy: { term: 'asc' },
      select: { term: true },
    });
    return rows.map((row) => row.term);
  }

  /** Replaces the synonyms of one model or calculator (duplicates after normalisation are merged). */
  async replaceSynonyms(
    admin: AdminPrincipal,
    entityType: SearchEntityType,
    entityId: string,
    input: { terms: string[]; reason: string },
    client: ClientInfo,
  ): Promise<string[]> {
    const grant = entityType === 'CALCULATOR' ? 'calculators.draft' : 'library.write';
    if (!admin.grants.includes(grant)) {
      throw new DomainError('FORBIDDEN', `Editing these synonyms needs the ${grant} grant.`);
    }
    const unique = new Map<string, string>();
    for (const raw of input.terms) {
      const term = raw.trim().replace(/\s+/g, ' ');
      const key = normalize(term);
      if (term && key && !unique.has(key)) unique.set(key, term);
    }
    if (unique.size > MAX_SYNONYMS) {
      throw new DomainError('VALIDATION_FAILED', 'Too many synonyms.', {
        fields: { terms: [`At most ${MAX_SYNONYMS} synonyms.`] },
      });
    }
    const before = await this.synonymsOf(entityType, entityId);
    await this.prisma.$transaction(async (tx) => {
      await tx.searchSynonym.deleteMany({ where: { entityType, entityId } });
      if (unique.size > 0) {
        await tx.searchSynonym.createMany({
          data: [...unique].map(([termNormalized, term]) => ({
            entityType,
            entityId,
            term,
            termNormalized,
          })),
        });
      }
    });
    this.synonymCache = null;
    const after = await this.synonymsOf(entityType, entityId);
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: 'search.synonyms_replaced',
      entityType: entityType === 'CALCULATOR' ? 'Calculator' : 'ReferenceDocument',
      entityId,
      before: { terms: before },
      after: { terms: after },
      reason: input.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return after;
  }

  // ───────────────────────────────── helpers ─────────────────────────────────

  /**
   * Everything the viewer could find: reference models, calculators and substances, with access.
   */
  private async candidates(viewer: Viewer, type?: SearchType): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];
    for (const referenceType of ['ORDONNANCE', 'CERTIFICATE'] as const) {
      if (type && type !== referenceType) continue;
      for (const item of await this.references.list(viewer, referenceType)) {
        hits.push({
          type: referenceType,
          id: item.id,
          slug: null,
          titleFr: item.titleFr,
          titleEn: item.titleEn,
          purposeFr: null,
          purposeEn: null,
          access: item.access,
        });
      }
    }
    if (!type || type === 'CALCULATOR') {
      for (const calculator of await this.calculators.list(viewer)) {
        hits.push({
          type: 'CALCULATOR',
          id: calculator.id,
          slug: calculator.slug,
          titleFr: calculator.nameFr,
          titleEn: calculator.nameEn,
          purposeFr: calculator.purposeFr,
          purposeEn: calculator.purposeEn,
          access: calculator.access,
        });
      }
    }
    if (!type || type === 'PREGNANCY') {
      for (const substance of await this.pregnancy.searchable(viewer)) {
        hits.push({
          type: 'PREGNANCY',
          id: substance.id,
          slug: null,
          titleFr: substance.nameFr,
          titleEn: substance.nameEn,
          purposeFr: null,
          purposeEn: null,
          access: substance.access,
          terms: substance.synonyms,
        });
      }
    }
    return hits;
  }

  /** The texts a candidate is matched on. */
  private entryOf(hit: SearchHit, synonyms: Map<string, string[]>): SearchEntry {
    const entityType: SearchEntityType =
      hit.type === 'CALCULATOR' ? 'CALCULATOR' : 'REFERENCE_DOCUMENT';
    return {
      type: hit.type,
      titles: [hit.titleFr, hit.titleEn ?? ''],
      synonyms: hit.terms ?? synonyms.get(`${entityType}:${hit.id}`) ?? [],
      purposes: [hit.purposeFr ?? '', hit.purposeEn ?? ''],
    };
  }

  /** Every admin-entered synonym, cached for a minute. */
  private async synonyms(): Promise<Map<string, string[]>> {
    if (this.synonymCache && Date.now() - this.synonymCache.at < SYNONYM_CACHE_MS) {
      return this.synonymCache.byEntity;
    }
    const rows = await this.prisma.searchSynonym.findMany({
      select: { entityType: true, entityId: true, term: true },
    });
    const byEntity = new Map<string, string[]>();
    for (const row of rows) {
      const key = `${row.entityType}:${row.entityId}`;
      byEntity.set(key, [...(byEntity.get(key) ?? []), row.term]);
    }
    this.synonymCache = { at: Date.now(), byEntity };
    return byEntity;
  }
}
