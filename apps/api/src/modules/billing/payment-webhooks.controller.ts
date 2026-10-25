import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentGateways } from './payments/payment-gateways.js';

/** Path whose bodies are kept raw (app.setup.ts): signatures are computed over the exact bytes. */
export const PAYMENT_WEBHOOKS_PATH = `/${USER_API_PREFIX}/payments/webhooks`;

/**
 * Gateway notifications (ADR-021), e.g. Chargily's `checkout.paid`. A notification is accepted
 * only with a valid signature, and even then only names an order: its outcome is read back from
 * the gateway, so a replayed or forged body can never activate anything by itself.
 */
@ApiExcludeController()
@Controller(PAYMENT_WEBHOOKS_PATH.slice(1))
export class PaymentWebhooksController {
  private readonly logger = new Logger(PaymentWebhooksController.name);

  constructor(
    private readonly gateways: PaymentGateways,
    private readonly checkout: CheckoutService,
  ) {}

  /**
   * POST /v1/payments/webhooks/:gateway: checks the signature, then confirms the named order with
   * the gateway.
   */
  @Post(':gateway')
  @HttpCode(HttpStatus.OK)
  async receive(@Param('gateway') gatewayId: string, @Req() request: Request): Promise<void> {
    const gateway = this.gateways.byId(gatewayId);
    if (!gateway) throw new NotFoundException();
    const body: unknown = request.body;
    const notice = Buffer.isBuffer(body) ? gateway.verifyWebhook(body, request.headers) : null;
    if (!notice) {
      this.logger.warn(`Rejected an unsigned or invalid ${gateway.id} webhook from ${request.ip}`);
      throw new UnauthorizedException();
    }
    // Answer 200 once authentic, whatever the order: the gateway would otherwise retry forever.
    // A failure to confirm now is caught up by the reconciliation job.
    try {
      await this.checkout.settleByProviderReference(gateway.id, notice.providerReference);
    } catch (error) {
      this.logger.error(`Could not settle ${gateway.id} order from webhook`, error);
    }
  }
}
