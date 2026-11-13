import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentUser, UserAuthGuard } from '../../infrastructure/security/user-auth.guard.js';
import type { UserPrincipal } from '../../infrastructure/security/user-tokens.js';
import {
  ActivityDto,
  ActivityQuery,
  ClearActivityQuery,
  FavoriteDto,
  FavoriteTargetParams,
  RecordActivityDto,
} from './activity.dto.js';
import { ActivityService } from './activity.service.js';

/**
 * These routes accept only real accounts; the services expect a "viewer", so the user is wrapped
 * as one.
 */
const asViewer = (user: UserPrincipal) => ({ accessContext: 'AUTHENTICATED' as const, ...user });

/** Favorites and the person's own research history (ScreenFavoritesRecents). Real accounts only. */
@ApiTags('activity')
@Controller(`${USER_API_PREFIX}/me`)
@UseGuards(UserAuthGuard)
@ApiBearerAuth('user')
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  /**
   * GET /v1/me/favorites: the person's favorites, newest first, each with its current title and
   * lock (or null when no longer published).
   */
  @Get('favorites')
  @ApiOkResponse({ type: [FavoriteDto] })
  async favorites(@CurrentUser() user: UserPrincipal): Promise<FavoriteDto[]> {
    return (await this.activity.favorites(asViewer(user))).map((view) => FavoriteDto.from(view));
  }

  /** PUT /v1/me/favorites/:targetType/:targetId: adds a favorite (idempotent). */
  @Put('favorites/:targetType/:targetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async addFavorite(
    @CurrentUser() user: UserPrincipal,
    @Param() params: FavoriteTargetParams,
  ): Promise<void> {
    await this.activity.addFavorite(asViewer(user), params.targetType, params.targetId);
  }

  /** DELETE /v1/me/favorites/:targetType/:targetId: removes a favorite (idempotent). */
  @Delete('favorites/:targetType/:targetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async removeFavorite(
    @CurrentUser() user: UserPrincipal,
    @Param() params: FavoriteTargetParams,
  ): Promise<void> {
    await this.activity.removeFavorite(user.userId, params.targetType, params.targetId);
  }

  /** Entries recorded on the device, synced in batches (up to 100). */
  @Post('activity')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async record(@CurrentUser() user: UserPrincipal, @Body() body: RecordActivityDto): Promise<void> {
    await this.activity.record(
      asViewer(user),
      body.deviceId,
      body.entries.map((entry) => ({ ...entry, occurredAt: new Date(entry.occurredAt) })),
    );
  }

  /** Newest first, 50 per page. */
  @Get('activity')
  @ApiOkResponse({ type: [ActivityDto] })
  async history(
    @CurrentUser() user: UserPrincipal,
    @Query() query: ActivityQuery,
  ): Promise<ActivityDto[]> {
    const records = await this.activity.history(asViewer(user), {
      kind: query.kind,
      before: query.before ? new Date(query.before) : undefined,
    });
    return records.map((record) => ActivityDto.from(record));
  }

  /** DELETE /v1/me/activity: clears the history, or only one kind of entry. */
  @Delete('activity')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async clear(
    @CurrentUser() user: UserPrincipal,
    @Query() query: ClearActivityQuery,
  ): Promise<void> {
    await this.activity.clearHistory(user.userId, query.kind);
  }
}
