import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ErrorResponse } from '../../common/errors/error-response.js';
import {
  PaymentProvider,
  SubscriptionStatus,
  TransactionStatus,
} from '../../generated/prisma/enums.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { RequireGrants } from '../admin-auth/index.js';
import { BillingLedgerService, type LedgerSubscription } from './billing-ledger.service.js';

/** A plan version as shown in the ledgers. */
export class LedgerPlanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() version!: number;
  @ApiProperty() nameFr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() durationDays!: number;
}

/** The person a subscription or payment belongs to. */
export class LedgerPersonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

/** The latest payment of a subscription. */
export class LedgerTransactionRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'DT-2026-001842' }) transactionId!: string;
  @ApiProperty({ enum: TransactionStatus, enumName: 'TransactionStatus' })
  status!: TransactionStatus;
  @ApiProperty({ enum: PaymentProvider, enumName: 'PaymentProvider' })
  paymentProvider!: PaymentProvider;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

/** One subscription in Admin Web. */
export class AdminSubscriptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: LedgerPersonDto }) user!: LedgerPersonDto;
  @ApiProperty({ type: LedgerPlanDto }) plan!: LedgerPlanDto;
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  status!: SubscriptionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodStart!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodEnd!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceEndsAt!: string | null;
  @ApiProperty({ type: LedgerTransactionRefDto, nullable: true })
  lastTransaction!: LedgerTransactionRefDto | null;

  /** Converts a ledger row into the response. */
  static from(row: LedgerSubscription): AdminSubscriptionDto {
    return {
      id: row.id,
      user: row.user,
      plan: planRef(row.plan),
      status: row.status,
      currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
      lastTransaction: row.lastTransaction
        ? { ...row.lastTransaction, createdAt: row.lastTransaction.createdAt.toISOString() }
        : null,
    };
  }
}

/** The plan fields shown in the ledgers. */
export function planRef(plan: LedgerSubscription['plan']): LedgerPlanDto {
  return {
    id: plan.id,
    code: plan.code,
    version: plan.version,
    nameFr: plan.nameFr,
    nameEn: plan.nameEn,
    durationDays: plan.durationDays,
  };
}

/** Filters of the subscriptions page. */
export class SubscriptionQuery {
  @ApiPropertyOptional({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ example: 'PRO_MONTHLY' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/)
  planCode?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id of the last row of the previous page.' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

/** « Abonnements » tab of Admin Web: who holds which plan, until when (section 07). */
@ApiTags('admin-subscriptions')
@Controller(`${ADMIN_API_PREFIX}/subscriptions`)
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class BillingLedgerController {
  constructor(private readonly ledger: BillingLedgerService) {}

  /** 50 per page, newest first; payments still pending are not subscriptions yet. */
  @Get()
  @RequireGrants('subscriptions.read')
  @ApiOkResponse({ type: [AdminSubscriptionDto] })
  async list(@Query() query: SubscriptionQuery): Promise<AdminSubscriptionDto[]> {
    return (await this.ledger.subscriptions(query)).map((row) => AdminSubscriptionDto.from(row));
  }
}
