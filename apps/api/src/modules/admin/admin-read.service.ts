import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type { AuditLogEntry } from '../../generated/prisma/client.js';
import { AccessService, AccessProfileDto } from '../access/index.js';
import { ActivityService } from '../activity/index.js';
import { type AdminPrincipal, AdminAccountsService } from '../admin-auth/index.js';
import { AnalyticsService } from '../analytics/index.js';
import { AuditService } from '../audit/index.js';
import { SessionsService } from '../auth/index.js';
import {
  AdminSubscriptionDto,
  BillingLedgerService,
  SubscriptionStatusService,
} from '../billing/index.js';
import { CalculatorsService } from '../calculators/index.js';
import { FinanceService } from '../finance/index.js';
import { ReferenceDocumentsService } from '../reference-library/index.js';
import { UsersService } from '../users/index.js';
import { VERIFICATION_SLA_HOURS, VerificationStatusService } from '../verification/index.js';
import type {
  AdminUserDetailDto,
  AdminUserDto,
  AuditEntryDto,
  OverviewDto,
  UserQuery,
  VerificationStateDto,
} from './admin.dto.js';

const DAY_MS = 86_400_000;
const WORK_LIST = 5;
const CONTENT_ACTIONS = ['reference.', 'calculator.'] as const;

type AdminUserRow = NonNullable<Awaited<ReturnType<UsersService['adminDetail']>>>;

/**
 * Admin-facing read models behind /admin/v1 that combine several modules (ADR-001: this module
 * owns no table; every read and write goes through the owning module's service).
 */
@Injectable()
export class AdminReadService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly access: AccessService,
    private readonly verification: VerificationStatusService,
    private readonly subscriptions: SubscriptionStatusService,
    private readonly ledger: BillingLedgerService,
    private readonly finance: FinanceService,
    private readonly analytics: AnalyticsService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly admins: AdminAccountsService,
    private readonly references: ReferenceDocumentsService,
    private readonly calculators: CalculatorsService,
  ) {}

  // ─────────────────────────────── users ───────────────────────────────

  async userList(query: UserQuery): Promise<AdminUserDto[]> {
    const rows = await this.users.adminList(query);
    return Promise.all(rows.map((row) => this.userRow(row)));
  }

  async userDetail(admin: AdminPrincipal, userId: string): Promise<AdminUserDetailDto> {
    const row = await this.users.adminDetail(userId);
    if (!row || row.status === 'DELETED') throw new DomainError('NOT_FOUND', 'User not found.');
    const [base, explained, activity, history] = await Promise.all([
      this.userRow(row),
      this.access.explainForUser(userId),
      this.activity.countsFor(userId),
      this.audit.history('User', userId),
    ]);
    const inputs = explained.inputs;
    const subscriptions = admin.grants.includes('subscriptions.read')
      ? (await this.ledger.subscriptions({ userId })).map((subscription) =>
          AdminSubscriptionDto.from(subscription),
        )
      : undefined;
    const profile = row.professionalProfile;
    return {
      ...base,
      language: row.preference?.language ?? null,
      academicYear: profile?.academicYear ?? null,
      residencyYear: profile?.residencyYear ?? null,
      orderNumberMasked: profile?.orderNumberMasked ?? null,
      institution: profile?.institution?.name ?? null,
      access: AccessProfileDto.from(explained.profile),
      accessInputs:
        inputs.accessContext === 'AUTHENTICATED'
          ? {
              accountStatus: inputs.account.status,
              professionalType: inputs.account.professionalType,
              academicYear: inputs.account.academicYear,
              verification: base.verification,
              subscriptionStatus: inputs.subscription?.status ?? null,
              subscriptionEndsAt:
                (
                  inputs.subscription?.graceEndsAt ?? inputs.subscription?.currentPeriodEnd
                )?.toISOString() ?? null,
            }
          : {
              accountStatus: row.status,
              professionalType: null,
              academicYear: null,
              verification: base.verification,
              subscriptionStatus: null,
              subscriptionEndsAt: null,
            },
      ...(subscriptions ? { subscriptions } : {}),
      activity,
      history: await this.presentAudit(history),
    };
  }

  /** « Suspendre »: sign-in and refresh are refused and every session ends (ADR-010). */
  async setUserStatus(
    admin: AdminPrincipal,
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    const exists = await this.users.adminDetail(userId);
    if (!exists || exists.status === 'DELETED')
      throw new DomainError('NOT_FOUND', 'User not found.');
    if (!(await this.users.setStatus(userId, status))) {
      throw new DomainError('INVALID_STATE', `The account is already ${status.toLowerCase()}.`);
    }
    if (status === 'SUSPENDED') await this.sessions.revokeAll(userId, 'ACCOUNT_SUSPENDED');
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: status === 'SUSPENDED' ? 'user.suspended' : 'user.reinstated',
      entityType: 'User',
      entityId: userId,
      before: { status: exists.status },
      after: { status },
      reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }

  /** « Réinitialiser la connexion »: every device signs in again. */
  async signOutEverywhere(
    admin: AdminPrincipal,
    userId: string,
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    const exists = await this.users.adminDetail(userId);
    if (!exists || exists.status === 'DELETED')
      throw new DomainError('NOT_FOUND', 'User not found.');
    await this.sessions.revokeAll(userId, 'ADMIN_REVOKED');
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: 'user.sessions_revoked',
      entityType: 'User',
      entityId: userId,
      reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }

  private async userRow(row: AdminUserRow): Promise<AdminUserDto> {
    const [snapshot, subscription] = await Promise.all([
      this.verification.snapshot(row.id),
      this.subscriptions.current(row.id),
    ]);
    const profile = row.professionalProfile;
    const statusCase =
      profile?.professionalType === 'STUDENT'
        ? snapshot.STUDENT_STATUS
        : snapshot.PROFESSIONAL_STATUS;
    const verification: VerificationStateDto = {
      identity: snapshot.IDENTITY.status,
      status: statusCase.status,
      statusExpiresAt: statusCase.expiresAt?.toISOString() ?? null,
    };
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      status: row.status,
      professionalType: profile?.professionalType ?? null,
      specialty: profile?.specialty
        ? { fr: profile.specialty.nameFr, en: profile.specialty.nameEn }
        : null,
      university: profile?.university?.name ?? null,
      wilaya: row.wilaya,
      verification,
      subscription: subscription?.status ?? null,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ─────────────────────────────── audit ───────────────────────────────

  async presentAudit(entries: AuditLogEntry[]): Promise<AuditEntryDto[]> {
    const names = await this.admins.names(
      entries.flatMap((entry) =>
        entry.actorType === 'ADMIN' && entry.actorId ? [entry.actorId] : [],
      ),
    );
    return entries.map((entry) => ({
      id: entry.id.toString(),
      occurredAt: entry.occurredAt.toISOString(),
      actorType: entry.actorType,
      actorId: entry.actorId,
      actorName:
        entry.actorType === 'ADMIN' && entry.actorId ? (names.get(entry.actorId) ?? null) : null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      reason: entry.reason,
      ip: entry.ip,
    }));
  }

  // ─────────────────────────────── overview ───────────────────────────────

  /** « Vue d'ensemble »: each block only for the admins whose grants cover it (section 07). */
  async overview(admin: AdminPrincipal, now = new Date()): Promise<OverviewDto> {
    const has = (grant: string) => admin.grants.includes(grant as AdminPrincipal['grants'][number]);
    const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
    const overview: OverviewDto = { slaHours: VERIFICATION_SLA_HOURS };
    const tasks: Promise<void>[] = [];

    if (has('analytics.read')) {
      tasks.push(
        this.analytics.activeSubjectsSince(monthAgo, now).then((value) => {
          overview.activeUsers30d = value;
        }),
      );
    }
    if (has('verification.queue.read')) {
      tasks.push(
        this.verification.waiting(now, VERIFICATION_SLA_HOURS, WORK_LIST).then(async (waiting) => {
          const names = await this.users.names(waiting.oldest.map((item) => item.userId));
          overview.pendingVerifications = waiting.count;
          overview.slaBreaches = waiting.breaches;
          overview.oldestCases = waiting.oldest.map((item) => {
            const name = names.get(item.userId);
            return {
              id: item.id,
              type: item.type,
              status: item.status,
              waitingSince: (item.appealedAt ?? item.submittedAt)?.toISOString() ?? null,
              personName: name ? `${name.firstName} ${name.lastName}` : '',
            };
          });
        }),
      );
    }
    if (has('subscriptions.read')) {
      tasks.push(
        this.ledger.subscriptionMetrics(now, monthAgo, now).then((metrics) => {
          overview.payingProfessionals = metrics.payingProfessionals;
        }),
      );
    }
    if (has('finance.read')) {
      tasks.push(
        this.finance.netRevenueSince(monthAgo, now).then((net) => {
          overview.netRevenue30dMinor = net;
        }),
      );
    }
    if (has('calculators.read')) {
      tasks.push(
        this.calculators.awaitingReview(WORK_LIST).then((versions) => {
          overview.versionsToReview = versions.map((version) => ({
            versionId: version.id,
            calculatorId: version.calculator.id,
            nameFr: version.calculator.nameFr,
            nameEn: version.calculator.nameEn,
            version: version.version,
            createdAt: version.createdAt.toISOString(),
          }));
        }),
      );
    }
    if (has('library.read')) {
      tasks.push(
        this.references.processingFailures(WORK_LIST).then((files) => {
          overview.fileFailures = files.map((file) => ({
            documentId: file.document.id,
            titleFr: file.document.titleFr,
            type: file.document.type,
            version: file.version,
            uploadedAt: file.uploadedAt.toISOString(),
          }));
        }),
      );
    }
    if (has('transactions.read')) {
      tasks.push(
        this.ledger
          .paymentIncidents(monthAgo, now, new Date(now.getTime() - 3_600_000))
          .then((incidents) => {
            overview.failedPayments30d = incidents.failed;
            overview.stalePendingPayments = incidents.stalePending;
          }),
      );
    }
    const contentPrefixes = CONTENT_ACTIONS.filter((prefix) =>
      prefix === 'reference.' ? has('library.read') : has('calculators.read'),
    );
    if (contentPrefixes.length > 0) {
      tasks.push(
        Promise.all(contentPrefixes.map((action) => this.audit.list({ action, limit: 10 }))).then(
          async (lists) => {
            const latest = lists
              .flat()
              .sort((a, b) => (a.id < b.id ? 1 : -1))
              .slice(0, 10);
            overview.latestChanges = await this.presentAudit(latest);
          },
        ),
      );
    }
    await Promise.all(tasks);
    return overview;
  }
}
