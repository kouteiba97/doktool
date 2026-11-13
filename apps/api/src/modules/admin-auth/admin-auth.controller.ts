import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { ADMIN_SESSION_COOKIE } from './admin-auth.policy.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import {
  AdminChangePasswordDto,
  AdminMeDto,
  AdminSignInDto,
  AdminSignInStepDto,
  AdminTotpDto,
} from './admin-auth.dto.js';
import { type AdminPrincipal, AdminAuthService } from './admin-auth.service.js';
import { AdminBoundaryGuard, CurrentAdmin, RequireGrants } from './admin-guards.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

@ApiTags('admin-auth')
@Controller(`${ADMIN_API_PREFIX}`)
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly accounts: AdminAccountsService,
  ) {}

  /** Step 1: e-mail + password. Never creates a session; answers with the TOTP step. */
  @Post('auth/sign-in')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminBoundaryGuard)
  @ApiOkResponse({ type: AdminSignInStepDto })
  @errors
  async signIn(
    @Body() body: AdminSignInDto,
    @Client() client: ClientInfo,
  ): Promise<AdminSignInStepDto> {
    return AdminSignInStepDto.from(await this.auth.signIn(body.email, body.password, client));
  }

  /** Step 2: TOTP code (verification, or first enrolment). Sets the session cookie. */
  @Post('auth/totp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminBoundaryGuard)
  @ApiOkResponse({ type: AdminMeDto })
  @errors
  async totp(
    @Body() body: AdminTotpDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminMeDto> {
    const { sessionToken, principal } = await this.auth.completeTotp(
      body.challengeToken,
      body.code,
      client,
    );
    response.cookie(ADMIN_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
    return AdminMeDto.from(principal);
  }

  /** POST /admin/v1/auth/sign-out: ends the session and deletes the cookie. */
  @Post('auth/sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants()
  @ApiNoContentResponse()
  @errors
  async signOut(
    @CurrentAdmin() admin: AdminPrincipal,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOut(admin, client);
    response.clearCookie(ADMIN_SESSION_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
  }

  /**
   * POST /admin/v1/auth/password: the signed-in admin changes their own password. The current
   * password is required; this session stays open and every other one ends.
   */
  @Post('auth/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants()
  @ApiNoContentResponse()
  @errors
  async changePassword(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: AdminChangePasswordDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.accounts.changeOwnPassword(admin, body, client);
  }

  /** The signed-in admin and effective grants; Admin Web renders its navigation from these. */
  @Get('me')
  @RequireGrants()
  @ApiOkResponse({ type: AdminMeDto })
  @errors
  me(@CurrentAdmin() admin: AdminPrincipal): AdminMeDto {
    return AdminMeDto.from(admin);
  }
}
