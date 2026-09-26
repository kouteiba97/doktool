import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { PlanDto, PlanSaleDto, PublishPlanDto } from './billing.dto.js';
import { PlansService } from './plans.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/** The plan catalogue in Admin Web: prices are set by the Super Admin (ADR-006 D4). */
@ApiTags('admin-plans')
@Controller(`${ADMIN_API_PREFIX}/plans`)
export class BillingAdminController {
  constructor(private readonly plans: PlansService) {}

  /** Every version of every plan, newest version first. */
  @Get()
  @RequireGrants('subscriptions.read')
  @ApiOkResponse({ type: [PlanDto] })
  async list(): Promise<PlanDto[]> {
    return (await this.plans.all()).map((plan) => PlanDto.from(plan));
  }

  /** A new plan, or a new version of a plan code (a price change is a new version). */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireGrants('subscriptions.plans.write')
  @ApiOkResponse({ type: PlanDto })
  @errors
  async publish(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: PublishPlanDto,
    @Client() client: ClientInfo,
  ): Promise<PlanDto> {
    return PlanDto.from(await this.plans.publish(admin, body, client));
  }

  @Post(':id/sale')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('subscriptions.plans.write')
  @ApiOkResponse({ type: PlanDto })
  @errors
  async sale(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PlanSaleDto,
    @Client() client: ClientInfo,
  ): Promise<PlanDto> {
    return PlanDto.from(await this.plans.setPurchasable(admin, id, body, client));
  }
}
