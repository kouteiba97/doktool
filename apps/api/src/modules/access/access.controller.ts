import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import {
  CurrentViewer,
  type Viewer,
  ViewerAuthGuard,
} from '../../infrastructure/security/viewer-auth.guard.js';
import { AccessProfileDto } from './access.dto.js';
import { AccessService } from './access.service.js';

/** GET /v1/me/access. */
@ApiTags('access')
@Controller(USER_API_PREFIX)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  /**
   * The caller's AccessProfile (user or demo token). The app renders every lock from it and
   * refreshes it on launch, on resume and after purchase or verification events.
   */
  @Get('me/access')
  @UseGuards(ViewerAuthGuard)
  @ApiBearerAuth('user')
  @ApiBearerAuth('demo')
  @ApiOkResponse({ type: AccessProfileDto })
  @ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
  async me(@CurrentViewer() viewer: Viewer): Promise<AccessProfileDto> {
    return AccessProfileDto.from(await this.access.profileFor(viewer));
  }
}
