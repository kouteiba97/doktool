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
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentUser, UserAuthGuard } from '../../infrastructure/security/user-auth.guard.js';
import type { UserPrincipal } from '../../infrastructure/security/user-tokens.js';
import {
  AuthTokensDto,
  ConfirmSignUpDto,
  DeleteAccountDto,
  OtpChallengeDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  ResendCodeDto,
  SessionDto,
  SignInDto,
  SignUpDto,
} from './auth.dto.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

@ApiTags('auth')
@Controller(`${USER_API_PREFIX}/auth`)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Creates (or restarts) an unconfirmed account and sends a 6-digit code. */
  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: OtpChallengeDto })
  @errors
  async signUp(@Body() body: SignUpDto, @Client() client: ClientInfo): Promise<OtpChallengeDto> {
    const view = await this.auth.signUp({ ...body, language: body.language ?? 'FR' }, client);
    return OtpChallengeDto.from(view);
  }

  /** Confirms the identifier with the code and signs the new account in on this device. */
  @Post('sign-up/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensDto })
  @errors
  async confirmSignUp(
    @Body() body: ConfirmSignUpDto,
    @Client() client: ClientInfo,
  ): Promise<AuthTokensDto> {
    return AuthTokensDto.from(
      await this.auth.confirmSignUp(body.challengeId, body.code, body.device, client),
    );
  }

  /** Sends a new code for a pending challenge (after 60 s). */
  @Post('codes/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OtpChallengeDto })
  @errors
  async resend(@Body() body: ResendCodeDto): Promise<OtpChallengeDto> {
    return OtpChallengeDto.from(
      await this.auth.resendCode(body.challengeId, body.language ?? 'FR'),
    );
  }

  /** POST /v1/auth/sign-in: password sign-in on a device. */
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensDto })
  @errors
  async signIn(@Body() body: SignInDto, @Client() client: ClientInfo): Promise<AuthTokensDto> {
    return AuthTokensDto.from(
      await this.auth.signIn(body.identifier, body.password, body.device, client),
    );
  }

  /** Rotates the refresh token. Call it once at a time: a reused token revokes the session. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensDto })
  @errors
  async refresh(@Body() body: RefreshDto, @Client() client: ClientInfo): Promise<AuthTokensDto> {
    return AuthTokensDto.from(await this.auth.refresh(body.refreshToken, body.deviceId, client));
  }

  /** POST /v1/auth/sign-out: ends this device's session. */
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiNoContentResponse()
  @errors
  async signOut(@CurrentUser() user: UserPrincipal): Promise<void> {
    await this.auth.signOut(user.userId, user.sessionId);
  }

  /** Always 202 with a challenge, whether or not an account exists. */
  @Post('password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: OtpChallengeDto })
  @errors
  async requestPasswordReset(
    @Body() body: PasswordResetRequestDto,
    @Client() client: ClientInfo,
  ): Promise<OtpChallengeDto> {
    return OtpChallengeDto.from(
      await this.auth.requestPasswordReset(body.identifier, body.language ?? 'FR', client),
    );
  }

  /** Sets the new password and signs every device out. */
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @errors
  async confirmPasswordReset(
    @Body() body: PasswordResetConfirmDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.auth.confirmPasswordReset(body.challengeId, body.code, body.newPassword, client);
  }
}

@ApiTags('auth')
@Controller(`${USER_API_PREFIX}/me/sessions`)
@UseGuards(UserAuthGuard)
@ApiBearerAuth('user')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** GET /v1/me/sessions: the devices signed in. */
  @Get()
  @ApiOkResponse({ type: [SessionDto] })
  async list(@CurrentUser() user: UserPrincipal): Promise<SessionDto[]> {
    const sessions = await this.sessions.listActive(user.userId);
    return sessions.map((session) => SessionDto.from(session, user.sessionId));
  }

  /** DELETE /v1/me/sessions/:id: signs one device out. */
  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @errors
  async revoke(
    @CurrentUser() user: UserPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<void> {
    await this.sessions.revoke(user.userId, sessionId, 'USER_REVOKED');
  }
}

/** Settings « Supprimer le compte » (section 08): confirmed with the password, not reversible. */
@ApiTags('account')
@Controller(`${USER_API_PREFIX}/me`)
@UseGuards(UserAuthGuard)
@ApiBearerAuth('user')
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /** POST /v1/me/account/deletion: deletes the account (password required). */
  @Post('deletion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @errors
  async delete(
    @CurrentUser() user: UserPrincipal,
    @Body() body: DeleteAccountDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.deletion.delete(user.userId, body.password, client);
  }
}
