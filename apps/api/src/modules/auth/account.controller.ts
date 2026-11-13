import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DomainError } from '../../common/errors/domain-error.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX, USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentUser, UserAuthGuard } from '../../infrastructure/security/user-auth.guard.js';
import type { UserPrincipal } from '../../infrastructure/security/user-tokens.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { UsersService } from '../users/index.js';
import {
  AccountContactsDto,
  AdminRecoveryDetailDto,
  AdminRecoveryDto,
  ContactConfirmDto,
  ContactRemoveDto,
  ContactRequestDto,
  PasswordChangeDto,
  RecoveryApproveDto,
  RecoveryAttachDto,
  RecoveryConfirmDto,
  RecoveryListQuery,
  RecoveryPhotoViewDto,
  RecoveryRejectDto,
  RecoveryStartDto,
  RecoveryStartedDto,
  RecoverySubmitDto,
  RecoverySubmittedDto,
  RecoveryTokenDto,
  RecoveryUploadRequestDto,
  RecoveryUploadTicketDto,
} from './account.dto.js';
import { AccountRecoveryService, type RecoverySlot } from './account-recovery.service.js';
import { AccountSecurityService } from './account-security.service.js';
import { OtpChallengeDto } from './auth.dto.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/** Settings › Compte: contacts and password (ADR-023). */
@ApiTags('account')
@Controller(`${USER_API_PREFIX}/me`)
@UseGuards(UserAuthGuard)
@ApiBearerAuth('user')
export class AccountSecurityController {
  constructor(
    private readonly security: AccountSecurityService,
    private readonly users: UsersService,
    private readonly recovery: AccountRecoveryService,
  ) {}

  /** The e-mail and phone, and whether both are confirmed (« récupérable »). */
  @Get('contacts')
  @ApiOkResponse({ type: AccountContactsDto })
  async contacts(@CurrentUser() user: UserPrincipal): Promise<AccountContactsDto> {
    const contacts = await this.users.contactsOf(user.userId);
    if (!contacts) throw new DomainError('UNAUTHENTICATED', 'Account not found.');
    return AccountContactsDto.from(contacts, await this.recovery.openForUser(user.userId));
  }

  /** « Ce n’est pas moi »: stops a recovery of this account someone else asked for. */
  @Post('recovery/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccountContactsDto })
  @errors
  async cancelRecovery(@CurrentUser() user: UserPrincipal): Promise<AccountContactsDto> {
    await this.recovery.cancelForOwner(user.userId);
    return this.contacts(user);
  }

  /** Sends a code to the contact to add; confirm it with `contacts/confirm`. */
  @Post('contacts')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: OtpChallengeDto })
  @errors
  async requestContact(
    @CurrentUser() user: UserPrincipal,
    @Body() body: ContactRequestDto,
  ): Promise<OtpChallengeDto> {
    return OtpChallengeDto.from(
      await this.security.requestContact(user.userId, {
        identifier: body.identifier,
        password: body.password,
        language: body.language ?? 'FR',
      }),
    );
  }

  /**
   * Confirms the code sent to the new contact; the contact is then added or replaces the old one.
   */
  @Post('contacts/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccountContactsDto })
  @errors
  async confirmContact(
    @CurrentUser() user: UserPrincipal,
    @Body() body: ContactConfirmDto,
    @Client() client: ClientInfo,
  ): Promise<AccountContactsDto> {
    await this.security.confirmContact(user.userId, body, client);
    return this.contacts(user);
  }

  /** Removes the e-mail or the phone; the other one must be confirmed. */
  @Post('contacts/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccountContactsDto })
  @errors
  async removeContact(
    @CurrentUser() user: UserPrincipal,
    @Body() body: ContactRemoveDto,
    @Client() client: ClientInfo,
  ): Promise<AccountContactsDto> {
    await this.security.removeContact(user.userId, body.channel, body.password, client);
    return this.contacts(user);
  }

  /** Changes the password; other devices are signed out. */
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @errors
  async changePassword(
    @CurrentUser() user: UserPrincipal,
    @Body() body: PasswordChangeDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.security.changePassword(user.userId, user.sessionId, body, client);
  }
}

/**
 * « J’ai perdu l’accès à mon e-mail et à mon téléphone » (ADR-023). No session: the new contact
 * is proven by a code, then a short-lived recovery token carries the two photos.
 */
@ApiTags('auth')
@Controller(`${USER_API_PREFIX}/auth/recovery`)
export class AccountRecoveryController {
  constructor(private readonly recovery: AccountRecoveryService) {}

  /**
   * POST /v1/account-recovery: starts a recovery (no account token: the person has lost access).
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: RecoveryStartedDto })
  @errors
  async start(
    @Body() body: RecoveryStartDto,
    @Client() client: ClientInfo,
  ): Promise<RecoveryStartedDto> {
    const started = await this.recovery.start({ ...body, language: body.language ?? 'FR' }, client);
    return { requestId: started.requestId, challenge: OtpChallengeDto.from(started.challenge) };
  }

  /** Confirms the code sent to the new contact; returns the recovery token used for the photos. */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RecoveryTokenDto })
  @errors
  async confirm(
    @Body() body: RecoveryConfirmDto,
    @Client() client: ClientInfo,
  ): Promise<RecoveryTokenDto> {
    const { recoveryToken, expiresAt } = await this.recovery.confirmContact(body, client);
    return { recoveryToken, expiresAt: expiresAt.toISOString() };
  }

  /** A signed upload URL for one photo. */
  @Post('uploads')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RecoveryUploadTicketDto })
  @errors
  async upload(@Body() body: RecoveryUploadRequestDto): Promise<RecoveryUploadTicketDto> {
    return RecoveryUploadTicketDto.from(
      await this.recovery.requestUpload(body.recoveryToken, body),
    );
  }

  /** Attaches an uploaded photo to the request. */
  @Post('photos')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @errors
  async attach(@Body() body: RecoveryAttachDto): Promise<void> {
    await this.recovery.attach(body.recoveryToken, body);
  }

  /** Sends the request for review once both photos are there. */
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RecoverySubmittedDto })
  @errors
  async submit(
    @Body() body: RecoverySubmitDto,
    @Client() client: ClientInfo,
  ): Promise<RecoverySubmittedDto> {
    return this.recovery.submit(body.recoveryToken, client);
  }
}

const id = new ParseUUIDPipe();
const SLOTS: RecoverySlot[] = ['IDENTITY_DOCUMENT', 'SELFIE'];

/** Admin Web « Récupérations de compte »: the review queue of ADR-023. */
@ApiTags('admin-account-recovery')
@Controller(`${ADMIN_API_PREFIX}/account-recoveries`)
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class AccountRecoveryAdminController {
  constructor(private readonly recovery: AccountRecoveryService) {}

  /** Admin: the recovery requests. */
  @Get()
  @RequireGrants('verification.queue.read')
  @ApiOkResponse({ type: [AdminRecoveryDto] })
  async list(@Query() query: RecoveryListQuery): Promise<AdminRecoveryDto[]> {
    return (await this.recovery.list(query)).map((row) => AdminRecoveryDto.from(row));
  }

  /** Admin: one recovery request. */
  @Get(':id')
  @RequireGrants('verification.queue.read')
  @ApiOkResponse({ type: AdminRecoveryDetailDto })
  async detail(@Param('id', id) requestId: string): Promise<AdminRecoveryDetailDto> {
    return this.toDetail(await this.recovery.detail(requestId));
  }

  /** A 60-second view of one photo, audited; needs the time-limited documents grant. */
  @Post(':id/photos/:slot')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.documents.view')
  @ApiParam({ name: 'slot', enum: SLOTS, enumName: 'RecoveryPhotoSlot' })
  @ApiOkResponse({ type: RecoveryPhotoViewDto })
  async photo(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) requestId: string,
    @Param('slot') slot: string,
    @Client() client: ClientInfo,
  ): Promise<RecoveryPhotoViewDto> {
    if (!SLOTS.includes(slot as RecoverySlot)) throw new DomainError('NOT_FOUND', 'No such photo.');
    const view = await this.recovery.viewPhoto(admin, requestId, slot as RecoverySlot, client);
    return { ...view, expiresAt: view.expiresAt.toISOString() };
  }

  /** Admin: approves a request (applies after the hold). */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.review')
  @ApiOkResponse({ type: AdminRecoveryDetailDto })
  async approve(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) requestId: string,
    @Body() body: RecoveryApproveDto,
    @Client() client: ClientInfo,
  ): Promise<AdminRecoveryDetailDto> {
    return this.toDetail(await this.recovery.approve(admin, requestId, body.note, client));
  }

  /** Admin: rejects a request with a reason. */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.review')
  @ApiOkResponse({ type: AdminRecoveryDetailDto })
  async reject(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) requestId: string,
    @Body() body: RecoveryRejectDto,
    @Client() client: ClientInfo,
  ): Promise<AdminRecoveryDetailDto> {
    return this.toDetail(await this.recovery.reject(admin, requestId, body, client));
  }

  /** Builds the recovery drawer response. */
  private toDetail(
    detail: Awaited<ReturnType<AccountRecoveryService['detail']>>,
  ): AdminRecoveryDetailDto {
    const { request, account, verification } = detail;
    return {
      request: AdminRecoveryDto.from(request),
      account:
        account && verification
          ? {
              id: account.id,
              firstName: account.firstName,
              lastName: account.lastName,
              email: account.email,
              phone: account.phone,
              status: account.status,
              createdAt: account.createdAt.toISOString(),
              wilaya: account.wilaya.name,
              professionalType: account.professionalProfile?.professionalType ?? null,
              identityStatus: verification.IDENTITY.status,
              professionalStatus: verification.PROFESSIONAL_STATUS.status,
            }
          : null,
    };
  }
}
