import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { AdminStatus } from '../../generated/prisma/enums.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import {
  AdminAccountsService,
  TEMPORARY_GRANT_HOURS,
  TEMPORARY_GRANTS,
  type TemporaryGrant,
} from './admin-accounts.service.js';
import type { AdminPrincipal } from './admin-auth.service.js';
import { CurrentAdmin, RequireGrants } from './admin-guards.js';
import { type Grant, GRANTS, PRESETS, type Preset } from './grants.js';

/** Trims a text field before validation. */
const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const PRESET_NAMES = Object.keys(PRESETS) as Preset[];
const id = new ParseUUIDPipe();

/** A reason, required for every change to an admin account. */
class ReasonBody {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** Body of « Nouvel administrateur ». */
export class NewAdminBody extends ReasonBody {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ maxLength: 120 })
  @trimmed
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ enum: PRESET_NAMES, enumName: 'AdminPreset' })
  @IsIn(PRESET_NAMES)
  preset!: Preset;
}

/** Body of « Modifier les permissions ». */
export class GrantsBody extends ReasonBody {
  @ApiProperty({ enum: GRANTS, isArray: true })
  @IsIn(GRANTS, { each: true })
  @ArrayMaxSize(GRANTS.length)
  grants!: Grant[];
}

/** Body of a temporary grant. */
export class TemporaryGrantBody extends ReasonBody {
  @ApiProperty({ enum: TEMPORARY_GRANTS })
  @IsIn(TEMPORARY_GRANTS)
  grant!: TemporaryGrant;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: TEMPORARY_GRANT_HOURS.max,
    default: TEMPORARY_GRANT_HOURS.default,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TEMPORARY_GRANT_HOURS.max)
  hours?: number;
}

/** Body of suspend, reinstate and reset TOTP. */
export class StatusBody extends ReasonBody {}

class GrantorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

/** One grant of an admin, with its expiry and who granted it. */
export class AdminGrantDto {
  @ApiProperty({ enum: GRANTS }) grant!: string;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Temporary grants only.',
  })
  expiresAt!: string | null;
  @ApiProperty({ type: GrantorDto, nullable: true }) grantedBy!: GrantorDto | null;
}

/** One admin in « Permissions ». */
export class AdminAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: AdminStatus, enumName: 'AdminStatus' }) status!: AdminStatus;
  @ApiProperty({ description: 'An authenticator is enrolled (false after a TOTP reset).' })
  totpEnrolled!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastLoginAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [AdminGrantDto] }) grants!: AdminGrantDto[];
  @ApiProperty({
    enum: PRESET_NAMES,
    enumName: 'AdminPreset',
    nullable: true,
    description: 'The preset these permanent grants match exactly, if any.',
  })
  preset!: Preset | null;
}

/** A new admin and the one-time password to hand over. */
export class CreatedAdminDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    description: 'Shown once; the admin changes nothing, they enrol TOTP at first sign-in.',
  })
  oneTimePassword!: string;
}

/** When a temporary grant ends. */
export class TemporaryGrantDto {
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/** « Permissions » (ScreenPermissions): admins, presets, grants and temporary access (section 03). */
@ApiTags('admin-permissions')
@Controller(`${ADMIN_API_PREFIX}/admins`)
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  /**
   * GET /admin/v1/admins: every admin with their grants, and the preset their permanent grants
   * match (if any).
   */
  @Get()
  @RequireGrants('system.roles.write')
  @ApiOkResponse({ type: [AdminAccountDto] })
  @errors
  async list(): Promise<AdminAccountDto[]> {
    return (await this.accounts.list()).map((admin) => {
      const permanent = admin.grants
        .filter((grant) => grant.expiresAt === null)
        .map((grant) => grant.grant)
        .sort();
      const preset =
        PRESET_NAMES.find((name) => {
          const grants = [...PRESETS[name]].sort();
          return (
            grants.length === permanent.length &&
            grants.every((grant, index) => grant === permanent[index])
          );
        }) ?? null;
      return {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        status: admin.status,
        totpEnrolled: admin.totpSecretEncrypted !== null,
        lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
        createdAt: admin.createdAt.toISOString(),
        grants: admin.grants.map((grant) => ({
          grant: grant.grant,
          expiresAt: grant.expiresAt?.toISOString() ?? null,
          grantedBy: grant.grantedBy,
        })),
        preset,
      };
    });
  }

  /** POST /admin/v1/admins: creates an admin; the one-time password is shown once. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireGrants('system.roles.write')
  @ApiOkResponse({ type: CreatedAdminDto })
  @errors
  async create(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: NewAdminBody,
    @Client() client: ClientInfo,
  ): Promise<CreatedAdminDto> {
    const created = await this.accounts.createByAdmin(admin, body, body.reason, client);
    return { id: created.id, oneTimePassword: created.password };
  }

  /** PUT /admin/v1/admins/:id/grants: replaces the permanent grants. */
  @Put(':id/grants')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('system.roles.write')
  @ApiNoContentResponse()
  @errors
  async setGrants(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) adminId: string,
    @Body() body: GrantsBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.accounts.setGrants(admin, adminId, body.grants, body.reason, client);
  }

  /** POST /admin/v1/admins/:id/temporary-grants: a grant that expires after a few hours. */
  @Post(':id/temporary-grants')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('system.roles.write')
  @ApiOkResponse({ type: TemporaryGrantDto })
  @errors
  async grantTemporary(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) adminId: string,
    @Body() body: TemporaryGrantBody,
    @Client() client: ClientInfo,
  ): Promise<TemporaryGrantDto> {
    const expiresAt = await this.accounts.grantTemporary(
      admin,
      adminId,
      body.grant,
      body.hours ?? TEMPORARY_GRANT_HOURS.default,
      body.reason,
      client,
    );
    return { expiresAt: expiresAt.toISOString() };
  }

  /** POST /admin/v1/admins/:id/suspend: blocks sign-in and ends sessions. */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('system.roles.write')
  @ApiNoContentResponse()
  @errors
  async suspend(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) adminId: string,
    @Body() body: StatusBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.accounts.setStatus(admin, adminId, 'SUSPENDED', body.reason, client);
  }

  /** POST /admin/v1/admins/:id/reinstate: lifts the suspension. */
  @Post(':id/reinstate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('system.roles.write')
  @ApiNoContentResponse()
  @errors
  async reinstate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) adminId: string,
    @Body() body: StatusBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.accounts.setStatus(admin, adminId, 'ACTIVE', body.reason, client);
  }

  /**
   * POST /admin/v1/admins/:id/reset-totp: the admin enrols a new authenticator at the next sign-
   * in.
   */
  @Post(':id/reset-totp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('system.roles.write')
  @ApiNoContentResponse()
  @errors
  async resetTotp(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) adminId: string,
    @Body() body: StatusBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.accounts.resetTotp(admin, adminId, body.reason, client);
  }
}
