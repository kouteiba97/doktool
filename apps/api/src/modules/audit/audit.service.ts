import { Injectable } from '@nestjs/common';
import type { AuditActorType, Prisma } from '../../generated/prisma/client.js';
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

/** Writes the append-only audit log (the table rejects updates and deletes). */
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
}
