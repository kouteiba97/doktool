import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ENV, type Env } from '../../config/env.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentUser, UserAuthGuard } from '../../infrastructure/security/user-auth.guard.js';
import type { UserPrincipal } from '../../infrastructure/security/user-tokens.js';
import {
  LegalDto,
  MeDto,
  SetProfessionalProfileDto,
  UpdatePreferencesDto,
  WilayaDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('account')
@Controller(USER_API_PREFIX)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Current terms version and the legal pages linked at sign-up (public). */
  @Get('legal')
  @ApiOkResponse({ type: LegalDto })
  legal(): LegalDto {
    return {
      termsVersion: this.env.TERMS_VERSION,
      termsUrl: this.env.TERMS_URL ?? null,
      privacyUrl: this.env.PRIVACY_URL ?? null,
    };
  }

  /** Wilayas for the sign-up form (public). */
  @Get('wilayas')
  @ApiOkResponse({ type: [WilayaDto] })
  listWilayas(): Promise<WilayaDto[]> {
    return this.users.listWilayas();
  }

  @Get('me')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ type: ErrorResponse })
  async me(@CurrentUser() user: UserPrincipal): Promise<MeDto> {
    return MeDto.from(await this.users.getMe(user.userId));
  }

  @Patch('me/preferences')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: MeDto })
  async updatePreferences(
    @CurrentUser() user: UserPrincipal,
    @Body() body: UpdatePreferencesDto,
  ): Promise<MeDto> {
    return MeDto.from(await this.users.updatePreferences(user.userId, body));
  }

  /** « Qui êtes-vous ? » — Doctor, Resident or Medical student (ADR-006 Q7). */
  @Post('me/professional-profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: MeDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'PROFILE_ALREADY_SET' })
  async setProfessionalProfile(
    @CurrentUser() user: UserPrincipal,
    @Body() body: SetProfessionalProfileDto,
  ): Promise<MeDto> {
    return MeDto.from(await this.users.setProfessionalProfile(user.userId, body));
  }
}
