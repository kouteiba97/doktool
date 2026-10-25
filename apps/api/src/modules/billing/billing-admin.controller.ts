import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentMethod } from '../../generated/prisma/enums.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import {
  PaymentMethodRouteDto,
  PaymentMethodSwitchDto,
  PlanDto,
  PlanSaleDto,
  PublishPlanDto,
} from './billing.dto.js';
import { PaymentGateways } from './payments/payment-gateways.js';
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

  /** POST /admin/v1/plans/:id/sale: starts or stops selling one version. */
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

/**
 * Finance › « Moyens de paiement » (ADR-021): which gateway takes each card, and the switch that
 * pauses a card in the app (e.g. while its network is down). Gateways themselves are configured
 * on the server, never from the browser.
 */
@ApiTags('admin-payment-methods')
@Controller(`${ADMIN_API_PREFIX}/payment-methods`)
export class PaymentMethodsAdminController {
  constructor(private readonly gateways: PaymentGateways) {}

  /** GET /admin/v1/payment-methods: methods with their gateway and switch. */
  @Get()
  @RequireGrants('finance.read')
  @ApiOkResponse({ type: [PaymentMethodRouteDto] })
  async list(): Promise<PaymentMethodRouteDto[]> {
    return (await this.gateways.routes()).map((route) =>
      PaymentMethodRouteDto.from(
        route,
        route.gateway ? (this.gateways.byId(route.gateway)?.channels[route.method] ?? null) : null,
      ),
    );
  }

  /** PUT /admin/v1/payment-methods/:method: switches a method on or off. */
  @Put(':method')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('subscriptions.plans.write')
  @ApiParam({ name: 'method', enum: PaymentMethod, enumName: 'PaymentMethod' })
  @ApiNoContentResponse()
  @errors
  async setEnabled(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('method', new ParseEnumPipe(PaymentMethod)) method: PaymentMethod,
    @Body() body: PaymentMethodSwitchDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.gateways.setEnabled(admin, method, body, client);
  }
}
