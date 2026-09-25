import {
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
  NotificationDto,
  NotificationListQuery,
  NotificationPageDto,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller(`${USER_API_PREFIX}/me/notifications`)
@UseGuards(UserAuthGuard)
@ApiBearerAuth('user')
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Newest first, 50 per page; the next page uses `before` = the last `createdAt`. */
  @Get()
  @ApiOkResponse({ type: NotificationPageDto })
  async list(
    @CurrentUser() user: UserPrincipal,
    @Query() query: NotificationListQuery,
  ): Promise<NotificationPageDto> {
    const before = query.before ? new Date(query.before) : undefined;
    const items = await this.notifications.list(user.userId, before);
    const unreadCount = await this.notifications.unreadCount(user.userId);
    return { items: items.map((item) => NotificationDto.from(item)), unreadCount };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async markAllRead(@CurrentUser() user: UserPrincipal): Promise<void> {
    await this.notifications.markAllRead(user.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async markRead(
    @CurrentUser() user: UserPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.notifications.markRead(user.userId, id);
  }
}
