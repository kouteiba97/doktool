import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX, USER_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { UsersService } from './users.service.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

export class SpecialtyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameFr!: string;
  @ApiProperty() nameEn!: string;
}

export class PlaceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() wilayaCode!: number;
}

export class InstitutionQuery {
  @ApiPropertyOptional({ description: 'Only the institutions of this wilaya.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  wilayaCode?: number;
}

class ReasonField {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CreateSpecialtyDto extends ReasonField {
  @ApiProperty({ example: 'CARDIOLOGY' }) @Matches(/^[A-Z][A-Z0-9_]{1,39}$/) code!: string;
  @ApiProperty() @trimmed @IsString() @MinLength(1) @MaxLength(120) nameFr!: string;
  @ApiProperty() @trimmed @IsString() @MinLength(1) @MaxLength(120) nameEn!: string;
}

export class CreatePlaceDto extends ReasonField {
  @ApiProperty() @trimmed @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(999) wilayaCode!: number;
}

/** Pickers of the onboarding and verification steps (never typed free text, section 06). */
@ApiTags('account')
@Controller(USER_API_PREFIX)
export class ReferenceDataController {
  constructor(private readonly users: UsersService) {}

  @Get('specialties')
  @ApiOkResponse({ type: [SpecialtyDto] })
  specialties(): Promise<SpecialtyDto[]> {
    return this.users.listSpecialties();
  }

  @Get('institutions')
  @ApiOkResponse({ type: [PlaceDto] })
  institutions(@Query() query: InstitutionQuery): Promise<PlaceDto[]> {
    return this.users.listInstitutions(query.wilayaCode);
  }

  @Get('universities')
  @ApiOkResponse({ type: [PlaceDto] })
  universities(): Promise<PlaceDto[]> {
    return this.users.listUniversities();
  }
}

/** Admin management of the pickers (grant `system.settings.write`). The lists are operator data. */
@ApiTags('admin-reference-data')
@Controller(`${ADMIN_API_PREFIX}/reference-data`)
export class ReferenceDataAdminController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Post('specialties')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('system.settings.write')
  @ApiOkResponse({ type: SpecialtyDto })
  @errors
  async createSpecialty(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: CreateSpecialtyDto,
    @Client() client: ClientInfo,
  ): Promise<SpecialtyDto> {
    const created = await this.users.createSpecialty({
      code: body.code,
      nameFr: body.nameFr,
      nameEn: body.nameEn,
    });
    await this.record(
      admin,
      client,
      'reference_data.specialty_created',
      'Specialty',
      created.id,
      created,
      body.reason,
    );
    return created;
  }

  @Post('institutions')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('system.settings.write')
  @ApiOkResponse({ type: PlaceDto })
  @errors
  async createInstitution(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: CreatePlaceDto,
    @Client() client: ClientInfo,
  ): Promise<PlaceDto> {
    const created = await this.users.createInstitution({
      name: body.name,
      wilayaCode: body.wilayaCode,
    });
    await this.record(
      admin,
      client,
      'reference_data.institution_created',
      'Institution',
      created.id,
      created,
      body.reason,
    );
    return created;
  }

  @Post('universities')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('system.settings.write')
  @ApiOkResponse({ type: PlaceDto })
  @errors
  async createUniversity(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: CreatePlaceDto,
    @Client() client: ClientInfo,
  ): Promise<PlaceDto> {
    const created = await this.users.createUniversity({
      name: body.name,
      wilayaCode: body.wilayaCode,
    });
    await this.record(
      admin,
      client,
      'reference_data.university_created',
      'University',
      created.id,
      created,
      body.reason,
    );
    return created;
  }

  private record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    entityType: string,
    entityId: string,
    after: Record<string, string | number>,
    reason: string,
  ): Promise<void> {
    return this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action,
      entityType,
      entityId,
      after,
      reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
