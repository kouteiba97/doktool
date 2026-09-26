import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ENV, type Env } from '../../config/env.js';
import { DomainError } from '../../common/errors/domain-error.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentUser, UserAuthGuard } from '../../infrastructure/security/user-auth.guard.js';
import type { UserPrincipal } from '../../infrastructure/security/user-tokens.js';
import { UsersService } from '../users/index.js';
import { ACKNOWLEDGEMENT_VERSION } from './billing.policy.js';
import {
  CheckoutDto,
  CheckoutStartedDto,
  EligibilityDto,
  PlanDto,
  PlansDto,
  ReturnQuery,
  SubscriptionDto,
  SubscriptionOverviewDto,
  TransactionDto,
} from './billing.dto.js';
import { CheckoutService } from './checkout.service.js';
import { FakeGateway } from './payments/fake.gateway.js';
import { PaymentGateway } from './payments/payment-provider.js';
import { PlansService } from './plans.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/** Subscription screens of the app (ScreenPlans, ScreenSubscriptionMobile). Real accounts only. */
@ApiTags('subscription')
@Controller(`${USER_API_PREFIX}/subscription`)
export class BillingController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly plans: PlansService,
    private readonly users: UsersService,
    private readonly gateway: PaymentGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: SubscriptionOverviewDto })
  @errors
  async overview(@CurrentUser() user: UserPrincipal): Promise<SubscriptionOverviewDto> {
    const [eligibility, overview] = [
      await this.checkout.eligibility(user.userId),
      await this.checkout.overview(user.userId),
    ];
    return {
      eligibility: EligibilityDto.from(eligibility),
      subscription: overview.subscription ? SubscriptionDto.from(overview.subscription) : null,
      transactions: overview.transactions.map((transaction) => TransactionDto.from(transaction)),
    };
  }

  /** The offers, with whether checkout is open (only once professional verification is VERIFIED). */
  @Get('plans')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: PlansDto })
  @errors
  async listPlans(@CurrentUser() user: UserPrincipal): Promise<PlansDto> {
    const eligibility = await this.checkout.eligibility(user.userId);
    const type = (await this.users.getAccessFacts(user.userId))?.professionalType;
    const plans = type && type !== 'STUDENT' ? await this.plans.purchasable(type) : [];
    return {
      eligibility: EligibilityDto.from(eligibility),
      plans: plans.map((plan) => PlanDto.from(plan)),
      acknowledgementVersion: ACKNOWLEDGEMENT_VERSION,
    };
  }

  /** « Payer »: registers the order with the provider and returns its payment page. */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: CheckoutStartedDto })
  @errors
  async start(
    @CurrentUser() user: UserPrincipal,
    @Body() body: CheckoutDto,
  ): Promise<CheckoutStartedDto> {
    if (body.acknowledgementVersion !== ACKNOWLEDGEMENT_VERSION) {
      throw new DomainError('VALIDATION_FAILED', 'The acknowledgement shown is outdated.', {
        fields: { acknowledgementVersion: [`Current version is ${ACKNOWLEDGEMENT_VERSION}.`] },
      });
    }
    return this.checkout.start(user.userId, {
      planId: body.planId,
      provider: body.provider,
      language: body.language ?? 'FR',
    });
  }

  /** A payment's status, confirmed with the provider while pending (the app polls it). */
  @Get('transactions/:transactionId')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: TransactionDto })
  @errors
  async transaction(
    @CurrentUser() user: UserPrincipal,
    @Param() params: ReturnQuery,
  ): Promise<TransactionDto> {
    const transaction = await this.checkout.transaction(user.userId, params.transactionId);
    const [withPlan] = (await this.checkout.overview(user.userId)).transactions.filter(
      (candidate) => candidate.id === transaction.id,
    );
    return TransactionDto.from(
      withPlan ?? { ...transaction, plan: await this.plans.byId(transaction.planId) },
    );
  }

  /** « Ne pas renouveler »: access continues to the period end. */
  @Post('stop-renewal')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth('user')
  @ApiNoContentResponse()
  @errors
  async stopRenewal(@CurrentUser() user: UserPrincipal): Promise<void> {
    await this.checkout.stopRenewal(user.userId);
  }

  /**
   * Where the payment page sends the person back. The outcome is taken from the provider, never
   * from this request; the page only tells the person to return to the app.
   */
  @Get('checkout/return')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async paymentReturn(@Query() query: ReturnQuery): Promise<string> {
    const transaction = await this.checkout.settleByPublicId(query.transactionId);
    const paid = transaction?.status === 'SUCCEEDED';
    return page(
      paid ? 'Paiement confirmé · Payment confirmed' : 'Paiement terminé · Payment finished',
      paid
        ? 'Votre abonnement DokTool Pro est actif. Revenez dans l’application.<br>Your DokTool Pro subscription is active. Go back to the app.'
        : 'Revenez dans l’application pour voir le résultat.<br>Go back to the app to see the result.',
    );
  }

  /** Development only: the simulated payment page of the fake provider. */
  @Get('checkout/fake-page')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/html; charset=utf-8')
  fakePage(@Query('orderId') orderId: string): string {
    const order = this.fake().describe(orderId);
    if (!order) throw new NotFoundException();
    const button = (outcome: string, label: string) =>
      `<form method="post" action="fake-page"><input type="hidden" name="orderId" value="${escapeHtml(orderId)}">` +
      `<input type="hidden" name="outcome" value="${outcome}"><button>${label}</button></form>`;
    return page(
      'Paiement simulé (développement)',
      `${escapeHtml(order.description)} — ${(order.amountMinor / 100).toFixed(2)} ${order.currency}` +
        button('PAID', 'Payer') +
        button('FAILED', 'Refuser'),
    );
  }

  @Post('checkout/fake-page')
  @ApiExcludeEndpoint()
  fakeSettle(
    @Body() body: { orderId?: string; outcome?: string },
    @Res() response: Response,
  ): void {
    const outcome = body.outcome === 'PAID' ? 'PAID' : 'FAILED';
    const returnUrl = this.fake().settle(String(body.orderId ?? ''), outcome);
    if (!returnUrl) throw new NotFoundException();
    response.redirect(303, returnUrl);
  }

  private fake(): FakeGateway {
    if (this.env.PAYMENT_PROVIDER !== 'fake' || !(this.gateway instanceof FakeGateway)) {
      throw new NotFoundException();
    }
    return this.gateway;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DokTool</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body></html>`;
}
