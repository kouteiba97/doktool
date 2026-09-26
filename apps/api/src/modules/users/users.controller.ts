import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ENV, type Env } from '../../config/env.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentUser, UserAuthGuard } from '../../infrastructure/security/user-auth.guard.js';
import type { UserPrincipal } from '../../infrastructure/security/user-tokens.js';
import { ProfilePhotoService } from './profile-photo.service.js';
import {
  AttachPhotoDto,
  LegalDto,
  MeDto,
  PhotoUploadRequestDto,
  PhotoUploadStartDto,
  SetProfessionalProfileDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
  WilayaDto,
} from './users.dto.js';
import { type MeRecord, UsersService } from './users.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

@ApiTags('account')
@Controller(USER_API_PREFIX)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly photos: ProfilePhotoService,
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
    return this.present(await this.users.getMe(user.userId));
  }

  /** « Modifier »: name and bio (≤ 280 characters). */
  @Patch('me/profile')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: MeDto })
  @errors
  async updateProfile(
    @CurrentUser() user: UserPrincipal,
    @Body() body: UpdateProfileDto,
  ): Promise<MeDto> {
    return this.present(await this.users.updateProfile(user.userId, body));
  }

  @Patch('me/preferences')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: MeDto })
  async updatePreferences(
    @CurrentUser() user: UserPrincipal,
    @Body() body: UpdatePreferencesDto,
  ): Promise<MeDto> {
    return this.present(await this.users.updatePreferences(user.userId, body));
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
    return this.present(await this.users.setProfessionalProfile(user.userId, body));
  }

  /** Signs a direct upload of a new profile photo (JPEG or PNG, 8 MB at most). */
  @Post('me/photo/uploads')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: PhotoUploadStartDto })
  @errors
  async requestPhotoUpload(
    @CurrentUser() user: UserPrincipal,
    @Body() body: PhotoUploadRequestDto,
  ): Promise<PhotoUploadStartDto> {
    const { imageId, upload } = await this.photos.requestUpload(user.userId, body);
    return { imageId, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
  }

  /** Re-encodes the uploaded photo (512 px WebP, no metadata) and makes it the profile photo. */
  @Post('me/photo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: MeDto })
  @errors
  async attachPhoto(
    @CurrentUser() user: UserPrincipal,
    @Body() body: AttachPhotoDto,
  ): Promise<MeDto> {
    await this.photos.attach(user.userId, body);
    return this.present(await this.users.getMe(user.userId));
  }

  @Delete('me/photo')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: MeDto })
  @errors
  async removePhoto(@CurrentUser() user: UserPrincipal): Promise<MeDto> {
    await this.photos.remove(user.userId);
    return this.present(await this.users.getMe(user.userId));
  }

  private async present(record: MeRecord): Promise<MeDto> {
    return MeDto.from(record, await this.photos.urlOf(record.avatarStorageKey));
  }
}
