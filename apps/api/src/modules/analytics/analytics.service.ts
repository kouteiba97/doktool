import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';
import {
  type ClientPlatform,
  Prisma,
  type ProfessionalType,
} from '../../generated/prisma/client.js';
import { hmacSha256Hex } from '../../infrastructure/crypto/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { ServerAnalyticsEvent } from '../../infrastructure/jobs/analytics-job.js';
import type { RateLimitRule } from '../../infrastructure/rate-limit/rate-limiter.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { AccessService } from '../access/index.js';
import { CalculatorsService } from '../calculators/index.js';
import { DemoService } from '../demo/index.js';
import { ReferenceDocumentsService } from '../reference-library/index.js';
import { UsersService } from '../users/index.js';
import { VerificationStatusService } from '../verification/index.js';
import {
  checkEvent,
  type ClientEventInput,
  MAX_DASHBOARD_DAYS,
  type RejectionReason,
  suppress,
} from './analytics.policy.js';

const INGEST_LIMIT: RateLimitRule = {
  name: 'analytics-ingest:subject',
  limit: 60,
  windowSeconds: 60,
};

export interface IngestResult {
  accepted: number;
  rejected: Partial<Record<RejectionReason, number>>;
}

export interface DashboardFilter {
  from: Date;
  to: Date;
  professionalType?: ProfessionalType;
  specialtyCode?: string;
}

/** A count and the number of distinct people behind it; null when fewer than 10 (« < 10 »). */
export type Cell = number | null;

interface Envelope {
  subjectHash: string;
  accessContext: 'AUTHENTICATED' | 'DEMO';
  professionalType: ProfessionalType | null;
  entitlementTier: 'DEMO' | 'STUDENT' | 'PROFESSIONAL_UNPAID' | 'PROFESSIONAL' | 'RESTRICTED';
  specialtyCode: string | null;
  wilayaCode: number | null;
}

/**
 * Pseudonymous event ingestion and aggregates (section 16, Lock L42). The envelope is computed
 * here from the server's own facts: the app sends only the event, its time and its counts/codes.
 * Admins read aggregates only; no per-person timeline exists.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly users: UsersService,
    private readonly verification: VerificationStatusService,
    private readonly demo: DemoService,
    private readonly references: ReferenceDocumentsService,
    private readonly calculators: CalculatorsService,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ─────────────────────────────── ingestion ───────────────────────────────

  async ingest(
    viewer: Viewer,
    batch: {
      platform: 'IOS' | 'ANDROID';
      appVersion?: string;
      dataVersion?: string;
      events: ClientEventInput[];
    },
    now = new Date(),
  ): Promise<IngestResult> {
    const envelope = await this.envelopeOf(viewer);
    await this.limiter.hit(INGEST_LIMIT, envelope.subjectHash);
    const rejected: Partial<Record<RejectionReason, number>> = {};
    const rows: Prisma.AnalyticsEventCreateManyInput[] = [];
    for (const event of batch.events) {
      const checked = checkEvent(event, viewer.accessContext === 'DEMO', now);
      if (!checked.ok) {
        rejected[checked.reason] = (rejected[checked.reason] ?? 0) + 1;
        continue;
      }
      rows.push({
        ...envelope,
        type: event.type,
        occurredAt: event.occurredAt,
        platform: batch.platform,
        appVersion: batch.appVersion ?? null,
        dataVersion: batch.dataVersion ?? null,
        ...checked.columns,
        properties: checked.columns.properties as Prisma.InputJsonObject,
      });
    }
    if (rows.length > 0) await this.prisma.analyticsEvent.createMany({ data: rows });
    return { accepted: rows.length, rejected };
  }

  /** SUBSCRIPTION_STARTED / RENEWED, published by billing through the jobs queue. */
  async recordServerEvent(event: ServerAnalyticsEvent): Promise<void> {
    const facts = await this.users.analyticsFacts(event.userId);
    if (!facts) return;
    await this.prisma.analyticsEvent.create({
      data: {
        type: event.type,
        occurredAt: new Date(event.occurredAt),
        subjectHash: this.subject('user', event.userId),
        accessContext: 'AUTHENTICATED',
        professionalType: facts.professionalType,
        entitlementTier: 'PROFESSIONAL',
        specialtyCode: facts.specialtyCode,
        wilayaCode: facts.wilayaCode,
        platform: 'SERVER' satisfies ClientPlatform,
        properties: { planCode: event.planCode, planVersion: event.planVersion },
      },
    });
  }

  private async envelopeOf(viewer: Viewer): Promise<Envelope> {
    if (viewer.accessContext === 'DEMO') {
      return {
        subjectHash: this.subject('demo', viewer.demoSessionId),
        accessContext: 'DEMO',
        professionalType: null,
        entitlementTier: 'DEMO',
        specialtyCode: null,
        wilayaCode: null,
      };
    }
    const [profile, facts] = await Promise.all([
      this.access.profileFor(viewer),
      this.users.analyticsFacts(viewer.userId),
    ]);
    if (!facts) throw new DomainError('UNAUTHENTICATED', 'Account not found.');
    return {
      subjectHash: this.subject('user', viewer.userId),
      accessContext: 'AUTHENTICATED',
      professionalType: facts.professionalType,
      entitlementTier: profile.tier,
      specialtyCode: facts.specialtyCode,
      wilayaCode: facts.wilayaCode,
    };
  }

  /** Keyed hash: stable for one person, not reversible without the secret. */
  private subject(kind: 'user' | 'demo', id: string): string {
    return hmacSha256Hex(this.env.ANALYTICS_SUBJECT_SECRET, `${kind}:${id}`);
  }

  // ─────────────────────────────── dashboards ───────────────────────────────

  assertPeriod(filter: DashboardFilter): void {
    const days = (filter.to.getTime() - filter.from.getTime()) / 86_400_000;
    if (!(days > 0) || days > MAX_DASHBOARD_DAYS) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `The period must last 1 to ${MAX_DASHBOARD_DAYS} days.`,
        {
          fields: { to: [`1 to ${MAX_DASHBOARD_DAYS} days after from`] },
        },
      );
    }
  }

  /** Real-account events of the period and segment (demo events stay in the demo funnel). */
  private where(filter: DashboardFilter, from = filter.from, to = filter.to): Prisma.Sql {
    return Prisma.sql`occurred_at >= ${from} AND occurred_at < ${to}
      AND access_context = 'AUTHENTICATED'
      ${filter.professionalType ? Prisma.sql`AND professional_type = ${filter.professionalType}::professional_type` : Prisma.empty}
      ${filter.specialtyCode ? Prisma.sql`AND specialty_code = ${filter.specialtyCode}` : Prisma.empty}`;
  }

  /** « Usage »: active people by type, and daily actives against the previous period. */
  async usage(filter: DashboardFilter) {
    this.assertPeriod(filter);
    const length = filter.to.getTime() - filter.from.getTime();
    const previousFrom = new Date(filter.from.getTime() - length);
    const byType = await this.prisma.$queryRaw<
      { professional_type: ProfessionalType | null; subjects: number }[]
    >`
      SELECT professional_type, count(DISTINCT subject_hash)::int AS subjects
      FROM analytics_events WHERE ${this.where(filter)}
      GROUP BY professional_type`;
    const [total] = await this.prisma.$queryRaw<{ subjects: number }[]>`
      SELECT count(DISTINCT subject_hash)::int AS subjects FROM analytics_events WHERE ${this.where(filter)}`;
    const [previousTotal] = await this.prisma.$queryRaw<{ subjects: number }[]>`
      SELECT count(DISTINCT subject_hash)::int AS subjects FROM analytics_events
      WHERE ${this.where(filter, previousFrom, filter.from)}`;
    const daily = await this.dailyActives(filter, filter.from, filter.to);
    const previousDaily = await this.dailyActives(filter, previousFrom, filter.from);
    const cell = (subjects: number) => suppress(subjects, subjects);
    return {
      activeSubjects: cell(total?.subjects ?? 0),
      previousActiveSubjects: cell(previousTotal?.subjects ?? 0),
      byType: (['DOCTOR', 'RESIDENT', 'STUDENT'] as const).map((type) => ({
        professionalType: type,
        subjects: cell(byType.find((row) => row.professional_type === type)?.subjects ?? 0),
      })),
      daily: daily.map((row) => ({ day: row.day, subjects: cell(row.subjects) })),
      previousDaily: previousDaily.map((row) => ({ day: row.day, subjects: cell(row.subjects) })),
    };
  }

  private async dailyActives(filter: DashboardFilter, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<{ day: Date; subjects: number }[]>`
      SELECT date_trunc('day', occurred_at) AS day, count(DISTINCT subject_hash)::int AS subjects
      FROM analytics_events WHERE ${this.where(filter, from, to)}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((row) => ({ day: row.day.toISOString().slice(0, 10), subjects: row.subjects }));
  }

  /** « Bibliothèque »: searches, and opens / views / favorites per model. */
  async library(filter: DashboardFilter) {
    this.assertPeriod(filter);
    const [searches] = await this.prisma.$queryRaw<
      { events: number; subjects: number; empty: number }[]
    >`
      SELECT count(*)::int AS events, count(DISTINCT subject_hash)::int AS subjects,
             count(*) FILTER (WHERE (properties->>'resultCount')::int = 0)::int AS empty
      FROM analytics_events
      WHERE ${this.where(filter)} AND type IN ('SEARCH_PERFORMED', 'REFERENCE_SEARCHED')`;
    const rows = await this.prisma.$queryRaw<
      {
        entity_id: string;
        opens: number;
        views: number;
        offline_views: number;
        favorites: number;
        subjects: number;
      }[]
    >`
      SELECT entity_id,
             count(*) FILTER (WHERE type = 'REFERENCE_OPENED')::int AS opens,
             count(*) FILTER (WHERE type = 'REFERENCE_VIEWED')::int AS views,
             count(*) FILTER (WHERE type = 'REFERENCE_VIEWED' AND properties->>'source' = 'offline')::int AS offline_views,
             count(*) FILTER (WHERE type = 'FAVORITE_ADDED')::int AS favorites,
             count(DISTINCT subject_hash)::int AS subjects
      FROM analytics_events
      WHERE ${this.where(filter)} AND entity_type = 'REFERENCE_DOCUMENT' AND entity_id IS NOT NULL
        AND type IN ('REFERENCE_OPENED', 'REFERENCE_VIEWED', 'FAVORITE_ADDED')
      GROUP BY entity_id ORDER BY views DESC, opens DESC LIMIT 100`;
    const labels = await this.references.labels(rows.map((row) => row.entity_id));
    return {
      searches: suppress(searches?.events ?? 0, searches?.subjects ?? 0),
      searchesWithoutResult: suppress(searches?.empty ?? 0, searches?.subjects ?? 0),
      models: rows.map((row) => {
        const label = labels.get(row.entity_id);
        return {
          id: row.entity_id,
          titleFr: label?.titleFr ?? null,
          titleEn: label?.titleEn ?? null,
          type: label?.type ?? null,
          opens: suppress(row.opens, row.subjects),
          views: suppress(row.views, row.subjects),
          offlineViews: suppress(row.offline_views, row.subjects),
          favorites: suppress(row.favorites, row.subjects),
        };
      }),
    };
  }

  /** « Calculateurs »: starts vs completions by calculator and version. */
  async calculatorUse(filter: DashboardFilter) {
    this.assertPeriod(filter);
    const rows = await this.prisma.$queryRaw<
      {
        entity_id: string;
        calculator_version: number | null;
        starts: number;
        completions: number;
        subjects: number;
      }[]
    >`
      SELECT entity_id, calculator_version,
             count(*) FILTER (WHERE type = 'CALCULATOR_STARTED')::int AS starts,
             count(*) FILTER (WHERE type = 'CALCULATOR_COMPLETED')::int AS completions,
             count(DISTINCT subject_hash)::int AS subjects
      FROM analytics_events
      WHERE ${this.where(filter)} AND entity_type = 'CALCULATOR' AND entity_id IS NOT NULL
        AND type IN ('CALCULATOR_STARTED', 'CALCULATOR_COMPLETED')
      GROUP BY entity_id, calculator_version ORDER BY completions DESC, starts DESC LIMIT 200`;
    const labels = await this.calculators.labels(rows.map((row) => row.entity_id));
    return {
      rows: rows.map((row) => {
        const label = labels.get(row.entity_id);
        return {
          id: row.entity_id,
          nameFr: label?.nameFr ?? null,
          nameEn: label?.nameEn ?? null,
          version: row.calculator_version,
          starts: suppress(row.starts, row.subjects),
          completions: suppress(row.completions, row.subjects),
        };
      }),
    };
  }

  /** « Utilisateurs »: account → submitted case → verified (people, not events). */
  async onboarding(filter: DashboardFilter) {
    this.assertPeriod(filter);
    const [signUps, funnel] = await Promise.all([
      this.users.countSignUps(filter.from, filter.to),
      this.verification.funnel(filter.from, filter.to),
    ]);
    const people = (value: number) => suppress(value, value);
    return {
      signUps: people(signUps),
      submitted: people(funnel.submitted),
      verified: people(funnel.verified),
      rejected: people(funnel.rejected),
    };
  }

  /** « Abonnements »: subscriptions and renewals by plan (money lives in Finance). */
  async subscriptionActivity(filter: DashboardFilter) {
    this.assertPeriod(filter);
    const rows = await this.prisma.$queryRaw<
      { plan_code: string; started: number; renewed: number; subjects: number }[]
    >`
      SELECT properties->>'planCode' AS plan_code,
             count(*) FILTER (WHERE type = 'SUBSCRIPTION_STARTED')::int AS started,
             count(*) FILTER (WHERE type = 'SUBSCRIPTION_RENEWED')::int AS renewed,
             count(DISTINCT subject_hash)::int AS subjects
      FROM analytics_events
      WHERE ${this.where(filter)} AND type IN ('SUBSCRIPTION_STARTED', 'SUBSCRIPTION_RENEWED')
      GROUP BY 1 ORDER BY 1`;
    const [views] = await this.prisma.$queryRaw<{ events: number; subjects: number }[]>`
      SELECT count(*)::int AS events, count(DISTINCT subject_hash)::int AS subjects
      FROM analytics_events WHERE ${this.where(filter)} AND type = 'SUBSCRIPTION_VIEWED'`;
    return {
      planViews: suppress(views?.events ?? 0, views?.subjects ?? 0),
      byPlan: rows.map((row) => ({
        planCode: row.plan_code,
        started: suppress(row.started, row.subjects),
        renewed: suppress(row.renewed, row.subjects),
      })),
    };
  }

  /** « Démo »: starts → modules viewed → limits met → accounts (demo events only). */
  async demoFunnel(filter: DashboardFilter) {
    this.assertPeriod(filter);
    const sessions = await this.demo.stats(filter.from, filter.to);
    const rows = await this.prisma.$queryRaw<
      { module: string; viewed: number; limited: number; subjects: number }[]
    >`
      SELECT properties->>'module' AS module,
             count(*) FILTER (WHERE (properties->>'locked')::boolean IS NOT TRUE)::int AS viewed,
             count(*) FILTER (WHERE (properties->>'locked')::boolean)::int AS limited,
             count(DISTINCT subject_hash)::int AS subjects
      FROM analytics_events
      WHERE occurred_at >= ${filter.from} AND occurred_at < ${filter.to}
        AND access_context = 'DEMO' AND type = 'DEMO_FEATURE_VIEWED'
      GROUP BY 1 ORDER BY 1`;
    const people = (value: number) => suppress(value, value);
    return {
      started: people(sessions.started),
      converted: people(sessions.converted),
      modules: rows.map((row) => ({
        module: row.module,
        viewed: suppress(row.viewed, row.subjects),
        limitsMet: suppress(row.limited, row.subjects),
      })),
    };
  }

  /** When the latest event arrived (« mis à jour il y a … »). */
  async freshness(): Promise<Date | null> {
    const latest = await this.prisma.analyticsEvent.findFirst({
      orderBy: { id: 'desc' },
      select: { receivedAt: true },
    });
    return latest?.receivedAt ?? null;
  }

  /** People active since `from` (overview ledger strip). */
  async activeSubjectsSince(from: Date, to: Date): Promise<Cell> {
    const [row] = await this.prisma.$queryRaw<{ subjects: number }[]>`
      SELECT count(DISTINCT subject_hash)::int AS subjects FROM analytics_events
      WHERE occurred_at >= ${from} AND occurred_at < ${to} AND access_context = 'AUTHENTICATED'`;
    return suppress(row?.subjects ?? 0, row?.subjects ?? 0);
  }
}
