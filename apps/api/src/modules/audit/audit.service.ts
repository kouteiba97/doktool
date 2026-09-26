import { Injectable } from '@nestjs/common';
import type { AuditActorType, AuditLogEntry, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export interface AuditEntry {
  actorType: AuditActorType;
  actorId: string | null;
  /** Dotted verb, e.g. "admin.sign_in.succeeded". */
  action: string;
  entityType: string;
  entityId: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditFilter {
  actorType?: AuditActorType;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  /** Exact action, or a prefix ending with "." (e.g. "verification."). */
  action?: string;
  from?: Date;
  to?: Date;
  /** Entries older than this id (newest first). */
  before?: bigint;
  limit?: number;
}

export const AUDIT_PAGE = 50;
export const AUDIT_EXPORT_MAX = 10_000;

/** Writes the append-only audit log (the table rejects updates and deletes) and reads it back. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  /** Newest first, `limit` entries (default one page). */
  list(filter: AuditFilter): Promise<AuditLogEntry[]> {
    const action = filter.action?.trim();
    return this.prisma.auditLogEntry.findMany({
      where: {
        ...(filter.actorType ? { actorType: filter.actorType } : {}),
        ...(filter.actorId ? { actorId: filter.actorId } : {}),
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
        ...(action ? { action: action.endsWith('.') ? { startsWith: action } : action } : {}),
        ...(filter.from || filter.to
          ? {
              occurredAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lt: filter.to } : {}),
              },
            }
          : {}),
        ...(filter.before !== undefined ? { id: { lt: filter.before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: filter.limit ?? AUDIT_PAGE,
    });
  }

  /** The history of one record (drawer « Historique » tabs), newest first. */
  history(entityType: string, entityId: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.list({ entityType, entityId, limit });
  }
}
