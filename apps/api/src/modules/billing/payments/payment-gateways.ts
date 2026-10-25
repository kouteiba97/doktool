import { Inject, Injectable } from '@nestjs/common';
import type { ClientInfo } from '../../../common/http/client-info.js';
import { ENV, type Env } from '../../../config/env.js';
import {
  PaymentMethod as PaymentMethods,
  type PaymentMethod,
  type PaymentProvider,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AdminPrincipal } from '../../admin-auth/index.js';
import { AuditService } from '../../audit/index.js';
import { ChargilyGateway } from './chargily.gateway.js';
import { FakeGateway } from './fake.gateway.js';
import type { GatewayId, PaymentGateway } from './payment-provider.js';
import { SatimGateway } from './satim.gateway.js';

/** Card networks in the order the app lists them. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = Object.values(PaymentMethods);

/** One payment method, the gateway that takes it and whether it is switched on. */
export interface MethodRoute {
  method: PaymentMethod;
  /** The configured gateway that takes this method, or null when none accepts it. */
  gateway: GatewayId | null;
  /** Switched on or off by an admin (on unless a row says otherwise). */
  enabled: boolean;
}

/**
 * The configured gateways (ADR-021). PAYMENT_GATEWAYS lists them by priority: each method is
 * routed to the first gateway that accepts it, so a second gateway can take over a method, or be
 * added for a new one, by configuration alone. Admins can switch a method off (an outage).
 */
@Injectable()
export class PaymentGateways {
  private readonly active: readonly PaymentGateway[];

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    chargily: ChargilyGateway,
    satim: SatimGateway,
    fake: FakeGateway,
  ) {
    const all: Record<GatewayId, PaymentGateway> = { chargily, satim, fake };
    this.active = env.PAYMENT_GATEWAYS.map((id) => all[id]);
  }

  /** The gateway that takes a method now, or null (none configured, or switched off). */
  async forMethod(method: PaymentMethod): Promise<PaymentGateway | null> {
    const route = (await this.routes()).find((candidate) => candidate.method === method);
    if (!route?.enabled || !route.gateway) return null;
    return this.byId(route.gateway);
  }

  /** The gateway that recorded a channel, to confirm its transactions (even if since demoted). */
  forChannel(channel: PaymentProvider): PaymentGateway | null {
    return this.active.find((gateway) => Object.values(gateway.channels).includes(channel)) ?? null;
  }

  /** A configured gateway by id (null when not configured). */
  byId(id: string): PaymentGateway | null {
    return this.active.find((gateway) => gateway.id === id) ?? null;
  }

  /** Every method with its gateway and switch, for the app's choice and Admin Web. */
  async routes(): Promise<MethodRoute[]> {
    const settings = await this.prisma.paymentMethodSetting.findMany();
    return PAYMENT_METHODS.map((method) => ({
      method,
      gateway: this.active.find((gateway) => gateway.channels[method])?.id ?? null,
      enabled: settings.find((setting) => setting.method === method)?.enabled ?? true,
    }));
  }

  /** Admin Web « Moyens de paiement »: switches a method on or off, with a reason (audited). */
  async setEnabled(
    admin: AdminPrincipal,
    method: PaymentMethod,
    input: { enabled: boolean; reason: string },
    client: ClientInfo,
  ): Promise<void> {
    const before = await this.prisma.paymentMethodSetting.findUnique({ where: { method } });
    await this.prisma.paymentMethodSetting.upsert({
      where: { method },
      create: { method, enabled: input.enabled, updatedById: admin.adminId },
      update: { enabled: input.enabled, updatedById: admin.adminId },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: input.enabled ? 'payment_method.enabled' : 'payment_method.disabled',
      entityType: 'PaymentMethodSetting',
      entityId: method,
      before: { enabled: before?.enabled ?? true },
      after: { enabled: input.enabled },
      reason: input.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }

  /** The methods a person can pay with right now. */
  async availableMethods(): Promise<PaymentMethod[]> {
    return (await this.routes())
      .filter((route) => route.enabled && route.gateway !== null)
      .map((route) => route.method);
  }
}

/** The card network of each channel; a new channel does not compile until it is listed here. */
const CHANNEL_METHODS: Record<PaymentProvider, PaymentMethod> = {
  SATIM_CIB: 'CIB',
  SATIM_EDAHABIA: 'EDAHABIA',
  CHARGILY_CIB: 'CIB',
  CHARGILY_EDAHABIA: 'EDAHABIA',
};

/** The card network of a recorded channel. */
export function methodOfChannel(channel: PaymentProvider): PaymentMethod {
  return CHANNEL_METHODS[channel];
}
