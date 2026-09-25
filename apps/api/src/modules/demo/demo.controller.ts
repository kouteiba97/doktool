import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { DemoSessionDto, DemoTokenDto, RenewDemoTokenDto, StartDemoDto } from './demo.dto.js';
import { DemoService } from './demo.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

@ApiTags('demo')
@Controller(`${USER_API_PREFIX}/demo/sessions`)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /** « Explorer la démo »: no sign-up, no contact data. Returns a demo token and its renewal token. */
  @Post()
  @ApiCreatedResponse({ type: DemoSessionDto })
  @errors
  async start(@Body() body: StartDemoDto, @Client() client: ClientInfo): Promise<DemoSessionDto> {
    return DemoSessionDto.from(await this.demo.start(body.demoContext, body.deviceId, client));
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DemoTokenDto })
  @errors
  async renew(
    @Body() body: RenewDemoTokenDto,
    @Client() client: ClientInfo,
  ): Promise<DemoTokenDto> {
    const access = await this.demo.renew(body.renewalToken, body.deviceId, client);
    return {
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.accessTokenExpiresAt.toISOString(),
    };
  }
}
