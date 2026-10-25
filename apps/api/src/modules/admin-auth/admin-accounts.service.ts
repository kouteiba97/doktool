import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditService } from '../audit/index.js';
import type { AdminPrincipal } from './admin-auth.service.js';
import {
  GRANTS,
  type Grant,
  isGrant,
  PRESETS,
  type Preset,
  separationOfDutiesViolations,
} from './grants.js';

/** Grants an admin may receive for a few hours only (section 03). */
export const TEMPORARY_GRANTS = ['verification.documents.view'] as const;
export type TemporaryGrant = (typeof TEMPORARY_GRANTS)[number];
export const TEMPORARY_GRANT_HOURS = { default: 2, max: 8 } as const;

/** What is needed to create an admin account. */
export interface NewAdminAccount {
  email: string;
  fullName: string;
  password: string;
  preset: Preset;
  /** Admin granting the preset; null only when bootstrapping the first Super Admin. */
  grantedById: string | null;
}

/** Owner of `admin_accounts` and `admin_grants`. */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates an admin with the grants of a preset; refuses presets that break the separation of
   * duties, and duplicate e-mails.
   */
  async create(input: NewAdminAccount): Promise<{ id: string }> {
    const grants: readonly Grant[] = PRESETS[input.preset];
    const violations = separationOfDutiesViolations(grants, input.preset === 'SUPER_ADMIN');
    if (violations.length > 0) {
      throw new DomainError('VALIDATION_FAILED', violations.join('; '));
    }
    try {
      return await this.prisma.adminAccount.create({
        data: {
          email: input.email.trim().toLowerCase(),
          fullName: input.fullName.trim(),
          passwordHash: await this.hasher.hash(input.password),
          grants: {
            create: grants.map((grant) => ({ grant, grantedById: input.grantedById })),
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('ACCOUNT_EXISTS', 'An admin account already uses this e-mail.');
      }
      throw error;
    }
  }

  /** Non-expired grants of an admin, sorted. */
  async effectiveGrants(adminId: string): Promise<Grant[]> {
    const rows = await this.prisma.adminGrant.findMany({
      where: { adminId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { grant: true },
    });
    return rows
      .map((row) => row.grant)
      .filter(isGrant)
      .sort();
  }

  /** Full names shown in review trails, by admin id. */
  async names(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.adminAccount.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(rows.map((row) => [row.id, row.fullName]));
  }

  // ─────────────────────── « Permissions » of Admin Web (section 03) ───────────────────────

  /** Every admin with the grants in force (permanent, and temporary until they expire). */
  list(now = new Date()) {
    return this.prisma.adminAccount.findMany({
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        totpSecretEncrypted: true,
        grants: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          orderBy: { grant: 'asc' },
          select: {
            grant: true,
            expiresAt: true,
            createdAt: true,
            grantedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
  }

  /** A new admin from a preset; the one-time password is returned once and never stored. */
  async createByAdmin(
    actor: AdminPrincipal,
    input: { email: string; fullName: string; preset: Preset },
    reason: string,
    client: ClientInfo,
  ): Promise<{ id: string; password: string }> {
    const password = randomBytes(18).toString('base64url');
    const { id } = await this.create({ ...input, password, grantedById: actor.adminId });
    await this.record(actor, client, 'admin.account.created', id, {
      after: { email: input.email.trim().toLowerCase(), preset: input.preset },
      reason,
    });
    return { id, password };
  }

  /**
   * Replaces the permanent grants of another admin (temporary grants run out on their own).
   * The separation of duties of section 03 applies; nobody edits their own grants.
   */
  async setGrants(
    actor: AdminPrincipal,
    adminId: string,
    grants: Grant[],
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.assertOther(actor, adminId);
    const unique = [...new Set(grants)].sort();
    const superAdmin = GRANTS.every((grant) => unique.includes(grant));
    const violations = separationOfDutiesViolations(unique, superAdmin);
    if (violations.length > 0) {
      throw new DomainError('VALIDATION_FAILED', violations.join('; '), {
        fields: { grants: violations },
      });
    }
    const before = await this.prisma.adminGrant.findMany({
      where: { adminId, expiresAt: null },
      select: { grant: true },
    });
    await this.prisma.$transaction([
      this.prisma.adminGrant.deleteMany({
        where: { adminId, expiresAt: null, grant: { notIn: unique } },
      }),
      ...unique.map((grant) =>
        this.prisma.adminGrant.upsert({
          where: { adminId_grant: { adminId, grant } },
          create: { adminId, grant, grantedById: actor.adminId },
          update: { expiresAt: null, grantedById: actor.adminId },
        }),
      ),
    ]);
    await this.record(actor, client, 'admin.grants.updated', adminId, {
      before: before.map((row) => row.grant).sort(),
      after: unique,
      reason,
    });
  }

  /** Time-limited access, e.g. `verification.documents.view` for two hours (section 03). */
  async grantTemporary(
    actor: AdminPrincipal,
    adminId: string,
    grant: TemporaryGrant,
    hours: number,
    reason: string,
    client: ClientInfo,
  ): Promise<Date> {
    await this.assertOther(actor, adminId);
    const current = await this.prisma.adminGrant.findUnique({
      where: { adminId_grant: { adminId, grant } },
      select: { expiresAt: true },
    });
    if (current && current.expiresAt === null) {
      throw new DomainError('INVALID_STATE', 'This admin already holds the grant permanently.');
    }
    const expiresAt = new Date(Date.now() + hours * 3_600_000);
    await this.prisma.adminGrant.upsert({
      where: { adminId_grant: { adminId, grant } },
      create: { adminId, grant, grantedById: actor.adminId, expiresAt },
      update: { grantedById: actor.adminId, expiresAt },
    });
    await this.record(actor, client, 'admin.grant.temporary', adminId, {
      after: { grant, expiresAt: expiresAt.toISOString() },
      reason,
    });
    return expiresAt;
  }

  /** Suspension ends every session of the admin at once. */
  async setStatus(
    actor: AdminPrincipal,
    adminId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.assertOther(actor, adminId);
    const { count } = await this.prisma.adminAccount.updateMany({
      where: { id: adminId, status: status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
      data: { status },
    });
    if (count !== 1) {
      throw new DomainError('INVALID_STATE', `The admin is already ${status.toLowerCase()}.`);
    }
    if (status === 'SUSPENDED') await this.endSessions(adminId);
    await this.record(
      actor,
      client,
      status === 'SUSPENDED' ? 'admin.suspended' : 'admin.reinstated',
      adminId,
      { reason },
    );
  }

  /** Lost phone: the next sign-in enrols a new authenticator; current sessions end. */
  async resetTotp(
    actor: AdminPrincipal,
    adminId: string,
    reason: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.assertOther(actor, adminId);
    await this.prisma.adminAccount.update({
      where: { id: adminId },
      data: { totpSecretEncrypted: null, totpLastUsedStep: null },
    });
    await this.endSessions(adminId);
    await this.record(actor, client, 'admin.totp.reset', adminId, { reason });
  }

  /** Refuses changes to one's own account, and unknown admins. */
  private async assertOther(actor: AdminPrincipal, adminId: string): Promise<void> {
    if (actor.adminId === adminId) {
      throw new DomainError('FORBIDDEN', 'Another Super Admin changes your own access.');
    }
    const exists = await this.prisma.adminAccount.count({ where: { id: adminId } });
    if (exists === 0) throw new DomainError('NOT_FOUND', 'Admin not found.');
  }

  /** Revokes every open session of an admin. */
  private async endSessions(adminId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Writes the audit entry of a change to an admin account. */
  private record(
    actor: AdminPrincipal,
    client: ClientInfo,
    action: string,
    adminId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue; reason?: string },
  ): Promise<void> {
    return this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      action,
      entityType: 'AdminAccount',
      entityId: adminId,
      ...change,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
