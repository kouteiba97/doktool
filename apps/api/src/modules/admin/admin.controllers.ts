import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { AUDIT_EXPORT_MAX, AuditService } from '../audit/index.js';
import {
  AdminReasonBody,
  AdminUserDetailDto,
  AdminUserDto,
  AuditEntryDto,
  AuditQuery,
  OverviewDto,
  UserQuery,
} from './admin.dto.js';
import { AdminReadService } from './admin-read.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});
const id = new ParseUUIDPipe();

/** « Vue d'ensemble »: the ledger strip and the work lists the admin's grants cover. */
@ApiTags('admin-overview')
@Controller(`${ADMIN_API_PREFIX}/overview`)
export class OverviewController {
  constructor(private readonly reads: AdminReadService) {}

  @Get()
  @RequireGrants()
  @ApiOkResponse({ type: OverviewDto })
  @errors
  overview(@CurrentAdmin() admin: AdminPrincipal): Promise<OverviewDto> {
    return this.reads.overview(admin);
  }
}

/** « Utilisateurs » (ScreenUsersAdmin): profile, derived access, subscription, activity counts. */
@ApiTags('admin-users')
@Controller(`${ADMIN_API_PREFIX}/users`)
@errors
export class AdminUsersController {
  constructor(private readonly reads: AdminReadService) {}

  @Get()
  @RequireGrants('users.read')
  @ApiOkResponse({ type: [AdminUserDto] })
  list(@Query() query: UserQuery): Promise<AdminUserDto[]> {
    return this.reads.userList(query);
  }

  @Get(':id')
  @RequireGrants('users.read')
  @ApiOkResponse({ type: AdminUserDetailDto })
  detail(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) userId: string,
  ): Promise<AdminUserDetailDto> {
    return this.reads.userDetail(admin, userId);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('users.suspend')
  @ApiNoContentResponse()
  async suspend(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) userId: string,
    @Body() body: AdminReasonBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.reads.setUserStatus(admin, userId, 'SUSPENDED', body.reason, client);
  }

  @Post(':id/reinstate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('users.suspend')
  @ApiNoContentResponse()
  async reinstate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) userId: string,
    @Body() body: AdminReasonBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.reads.setUserStatus(admin, userId, 'ACTIVE', body.reason, client);
  }

  @Post(':id/sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('users.write')
  @ApiNoContentResponse()
  async signOut(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) userId: string,
    @Body() body: AdminReasonBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.reads.signOutEverywhere(admin, userId, body.reason, client);
  }
}

/** « Journal d'audit » (ScreenAuditLogs): immutable, filterable, exported with `audit.export`. */
@ApiTags('admin-audit')
@Controller(`${ADMIN_API_PREFIX}/audit`)
@errors
export class AuditLogController {
  constructor(
    private readonly audit: AuditService,
    private readonly reads: AdminReadService,
  ) {}

  @Get()
  @RequireGrants('audit.read')
  @ApiOkResponse({ type: [AuditEntryDto] })
  async list(@Query() query: AuditQuery): Promise<AuditEntryDto[]> {
    return this.reads.presentAudit(
      await this.audit.list({ ...query, before: query.before ? BigInt(query.before) : undefined }),
    );
  }

  /** The filtered log as CSV (at most 10 000 entries); the export is itself audited. */
  @Get('export')
  @RequireGrants('audit.read', 'audit.export')
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV (UTF-8, `;` separated).', schema: { type: 'string' } })
  @Header('Cache-Control', 'no-store')
  async export(
    @CurrentAdmin() admin: AdminPrincipal,
    @Query() query: AuditQuery,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const entries = await this.reads.presentAudit(
      await this.audit.list({
        ...query,
        before: query.before ? BigInt(query.before) : undefined,
        limit: AUDIT_EXPORT_MAX,
      }),
    );
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: 'audit.exported',
      entityType: 'AuditLog',
      entityId: null,
      after: {
        filter: JSON.parse(JSON.stringify(query)) as Record<string, string>,
        rows: entries.length,
      },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    const cell = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const header = [
      'occurredAt',
      'actorType',
      'actorId',
      'actorName',
      'action',
      'entityType',
      'entityId',
      'before',
      'after',
      'reason',
      'ip',
    ];
    const lines = entries.map((entry) =>
      [
        entry.occurredAt,
        entry.actorType,
        entry.actorId,
        entry.actorName,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.before,
        entry.after,
        entry.reason,
        entry.ip,
      ]
        .map(cell)
        .join(';'),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="doktool-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return `\uFEFF${[header.join(';'), ...lines].join('\r\n')}\r\n`;
  }
}
