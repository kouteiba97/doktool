import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentUser, UserAuthGuard } from '../../infrastructure/security/user-auth.guard.js';
import type { UserPrincipal } from '../../infrastructure/security/user-tokens.js';
import {
  AttachVerificationDocumentDto,
  StartVerificationDto,
  VerificationCaseDto,
  VerificationDetailsDto,
  VerificationOverviewDto,
  VerificationUploadRequestDto,
  VerificationUploadStartDto,
} from './verification.dto.js';
import { VerificationService } from './verification.service.js';

const id = new ParseUUIDPipe();

/** The person's verification (section 06). Real accounts only — never a demo token. */
@ApiTags('verification')
@Controller(`${USER_API_PREFIX}/me/verification`)
@UseGuards(UserAuthGuard)
@ApiBearerAuth('user')
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  /** Latest case of each type and whether a new one can start. */
  @Get()
  @ApiOkResponse({ type: VerificationOverviewDto })
  async overview(@CurrentUser() user: UserPrincipal): Promise<VerificationOverviewDto> {
    return VerificationOverviewDto.from(await this.verification.overview(user.userId));
  }

  @Post('cases')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VerificationCaseDto })
  async start(
    @CurrentUser() user: UserPrincipal,
    @Body() body: StartVerificationDto,
  ): Promise<VerificationCaseDto> {
    return VerificationCaseDto.from(
      await this.verification.start(user.userId, body.type, body.professionalType),
    );
  }

  @Put('cases/:id/details')
  @ApiOkResponse({ type: VerificationCaseDto })
  async saveDetails(
    @CurrentUser() user: UserPrincipal,
    @Param('id', id) caseId: string,
    @Body() body: VerificationDetailsDto,
  ): Promise<VerificationCaseDto> {
    return VerificationCaseDto.from(await this.verification.saveDetails(user.userId, caseId, body));
  }

  /** Signs a direct upload of one step's file to private storage. */
  @Post('cases/:id/uploads')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VerificationUploadStartDto })
  async requestUpload(
    @CurrentUser() user: UserPrincipal,
    @Param('id', id) caseId: string,
    @Body() body: VerificationUploadRequestDto,
  ): Promise<VerificationUploadStartDto> {
    return VerificationUploadStartDto.from(
      await this.verification.requestUpload(user.userId, caseId, body),
    );
  }

  /** Confirms an uploaded file and attaches it to its step. */
  @Post('cases/:id/documents')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VerificationCaseDto })
  async attach(
    @CurrentUser() user: UserPrincipal,
    @Param('id', id) caseId: string,
    @Body() body: AttachVerificationDocumentDto,
  ): Promise<VerificationCaseDto> {
    return VerificationCaseDto.from(await this.verification.attach(user.userId, caseId, body));
  }

  @Delete('cases/:id/documents/:documentId')
  @ApiOkResponse({ type: VerificationCaseDto })
  async removeDocument(
    @CurrentUser() user: UserPrincipal,
    @Param('id', id) caseId: string,
    @Param('documentId', id) documentId: string,
  ): Promise<VerificationCaseDto> {
    return VerificationCaseDto.from(
      await this.verification.removeDocument(user.userId, caseId, documentId),
    );
  }

  /** « Envoyer ». */
  @Post('cases/:id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VerificationCaseDto })
  async submit(
    @CurrentUser() user: UserPrincipal,
    @Param('id', id) caseId: string,
    @Client() client: ClientInfo,
  ): Promise<VerificationCaseDto> {
    return VerificationCaseDto.from(await this.verification.submit(user.userId, caseId, client));
  }

  /** Appeal after a second rejection; decided by a different reviewer. */
  @Post('cases/:id/appeal')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VerificationCaseDto })
  async appeal(
    @CurrentUser() user: UserPrincipal,
    @Param('id', id) caseId: string,
    @Client() client: ClientInfo,
  ): Promise<VerificationCaseDto> {
    return VerificationCaseDto.from(await this.verification.appeal(user.userId, caseId, client));
  }

  /** Deletes the files and declared details of a decided case now (deletion request). */
  @Post('cases/:id/erase')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VerificationCaseDto })
  async erase(
    @CurrentUser() user: UserPrincipal,
    @Param('id', id) caseId: string,
    @Client() client: ClientInfo,
  ): Promise<VerificationCaseDto> {
    return VerificationCaseDto.from(
      await this.verification.eraseDocuments(user.userId, caseId, client),
    );
  }
}
