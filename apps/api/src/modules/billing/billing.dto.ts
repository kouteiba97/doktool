import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PaymentProvider,
  ProfessionalType,
  SubscriptionStatus,
  TransactionStatus,
} from '../../generated/prisma/enums.js';
import type { Subscription, SubscriptionPlan, Transaction } from '../../generated/prisma/client.js';
import type { Eligibility } from './checkout.service.js';
import { metadataOf } from './checkout.service.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const iso = (date: Date | null) => date?.toISOString() ?? null;

export class PlanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRO_MONTHLY' }) code!: string;
  @ApiProperty() version!: number;
  @ApiProperty() nameFr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ description: 'Price in minor units (centimes), taxes included.' })
  priceMinor!: number;
  @ApiProperty({ example: 'DZD' }) currency!: string;
  @ApiProperty() durationDays!: number;
  @ApiProperty({ enum: ProfessionalType, enumName: 'ProfessionalType', isArray: true })
  audience!: ProfessionalType[];
  @ApiProperty({ type: [String] }) includesFr!: string[];
  @ApiProperty({ type: [String] }) includesEn!: string[];
  @ApiProperty({ type: [String], description: 'What the plan does not include, stated plainly.' })
  excludesFr!: string[];
  @ApiProperty({ type: [String] }) excludesEn!: string[];
  @ApiProperty() isPurchasable!: boolean;

  static from(plan: SubscriptionPlan): PlanDto {
    return {
      id: plan.id,
      code: plan.code,
      version: plan.version,
      nameFr: plan.nameFr,
      nameEn: plan.nameEn,
      priceMinor: plan.priceMinor,
      currency: plan.currency,
      durationDays: plan.durationDays,
      audience: plan.audience,
      includesFr: plan.includesFr,
      includesEn: plan.includesEn,
      excludesFr: plan.excludesFr,
      excludesEn: plan.excludesEn,
      isPurchasable: plan.isPurchasable,
    };
  }
}

export class EligibilityDto {
  @ApiProperty({
    enum: [
      'OPEN',
      'STUDENT_FREE',
      'ROLE_REQUIRED',
      'VERIFICATION_REQUIRED',
      'VERIFICATION_PENDING',
      'ACCOUNT_SUSPENDED',
      'ACTIVE',
      'ACCOUNT_REQUIRED',
    ],
    enumName: 'CheckoutEligibility',
  })
  state!: Eligibility['state'];

  @ApiPropertyOptional({ description: 'OPEN only: the payment extends the current period.' })
  renewal?: boolean;

  @ApiPropertyOptional({ format: 'date-time', description: 'ACTIVE only: renewal opens then.' })
  renewableFrom?: string;

  static from(eligibility: Eligibility): EligibilityDto {
    switch (eligibility.state) {
      case 'OPEN':
        return { state: 'OPEN', renewal: eligibility.renewal };
      case 'ACTIVE':
        return { state: 'ACTIVE', renewableFrom: eligibility.renewableFrom.toISOString() };
      default:
        return { state: eligibility.state };
    }
  }
}

export class PlansDto {
  @ApiProperty({ type: EligibilityDto }) eligibility!: EligibilityDto;
  @ApiProperty({
    type: [PlanDto],
    description: 'Empty for students (no subscription, ADR-006 Q2).',
  })
  plans!: PlanDto[];
  @ApiProperty({
    description: 'Version of the acknowledgement the review screen shows (« non remboursable »).',
  })
  acknowledgementVersion!: string;
}

export class SubscriptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  status!: SubscriptionStatus;
  @ApiProperty({ type: PlanDto }) plan!: PlanDto;
  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true }) currentPeriodStart!:
    string | null;
  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true }) currentPeriodEnd!:
    string | null;
  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true }) graceEndsAt!:
    string | null;

  static from(subscription: Subscription & { plan: SubscriptionPlan }): SubscriptionDto {
    return {
      id: subscription.id,
      status: subscription.status,
      plan: PlanDto.from(subscription.plan),
      currentPeriodStart: iso(subscription.currentPeriodStart),
      currentPeriodEnd: iso(subscription.currentPeriodEnd),
      graceEndsAt: iso(subscription.graceEndsAt),
    };
  }
}

export class TransactionDto {
  @ApiProperty({ example: 'DT-2026-000123' }) transactionId!: string;
  @ApiProperty({ enum: TransactionStatus, enumName: 'TransactionStatus' })
  status!: TransactionStatus;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: PaymentProvider, enumName: 'PaymentProvider' })
  paymentProvider!: PaymentProvider;
  @ApiProperty() planCode!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true }) paymentDate!:
    string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'FAILED only: the provider’s own message, shown as is.',
  })
  providerMessage!: string | null;

  static from(transaction: Transaction & { plan: { code: string } }): TransactionDto {
    const message = metadataOf(transaction).providerMessage;
    return {
      transactionId: transaction.transactionId,
      status: transaction.status,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      paymentProvider: transaction.paymentProvider,
      planCode: transaction.plan.code,
      createdAt: transaction.createdAt.toISOString(),
      paymentDate: iso(transaction.paymentDate),
      providerMessage: typeof message === 'string' ? message : null,
    };
  }
}

export class SubscriptionOverviewDto {
  @ApiProperty({ type: EligibilityDto }) eligibility!: EligibilityDto;
  @ApiPropertyOptional({ type: SubscriptionDto, nullable: true })
  subscription!: SubscriptionDto | null;
  @ApiProperty({ type: [TransactionDto], description: 'Newest first.' })
  transactions!: TransactionDto[];
}

export class CheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId!: string;

  @ApiProperty({ enum: PaymentProvider, enumName: 'PaymentProvider' })
  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;

  @ApiProperty({
    description:
      '« J’ai compris ce que comprend DokTool Pro. Le paiement n’est pas remboursable. »',
  })
  @Equals(true)
  acknowledged!: boolean;

  @ApiProperty({ description: 'The acknowledgement version the screen showed.' })
  @IsString()
  acknowledgementVersion!: string;

  @ApiPropertyOptional({ enum: ['FR', 'EN'], description: 'Language of the payment page.' })
  @IsOptional()
  @IsIn(['FR', 'EN'])
  language?: 'FR' | 'EN';
}

export class CheckoutStartedDto {
  @ApiProperty({ example: 'DT-2026-000123' }) transactionId!: string;
  @ApiProperty({ description: 'The payment provider’s page (CIB / Edahabia).' })
  redirectUrl!: string;
}

export class ReturnQuery {
  @ApiProperty({ example: 'DT-2026-000123' })
  @Matches(/^DT-[0-9]{4}-[0-9]{6}$/)
  transactionId!: string;
}

// ───────────────────────────────── admin ─────────────────────────────────

class ReasonField {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** A list of short plan lines (what is included / not included), up to 20 of 200 characters. */
const TextList = (description?: string) =>
  applyDecorators(
    ApiProperty({ type: [String], description }),
    IsArray(),
    ArrayMaxSize(20),
    IsString({ each: true }),
    MaxLength(200, { each: true }),
  );

export class PublishPlanDto extends ReasonField {
  @ApiProperty({ example: 'PRO_MONTHLY', description: 'Stable code; a new version keeps it.' })
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/)
  code!: string;

  @ApiProperty() @trimmed @IsString() @MinLength(1) @MaxLength(80) nameFr!: string;
  @ApiProperty() @trimmed @IsString() @MinLength(1) @MaxLength(80) nameEn!: string;

  @ApiProperty({ enum: ['DOCTOR', 'RESIDENT'], isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['DOCTOR', 'RESIDENT'], { each: true })
  audience!: ('DOCTOR' | 'RESIDENT')[];

  @ApiProperty({ description: 'Price in centimes, taxes included (e.g. 150000 = 1 500 DZD).' })
  @IsInt()
  @Min(5000)
  @Max(100_000_000)
  priceMinor!: number;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(1)
  @Max(3660)
  durationDays!: number;

  @TextList()
  includesFr!: string[];
  @TextList()
  includesEn!: string[];
  @TextList('Stated plainly: no drug database, no prescription or certificate writing.')
  excludesFr!: string[];
  @TextList()
  excludesEn!: string[];

  @ApiProperty({ description: 'Start selling this version now (earlier versions stop).' })
  @IsBoolean()
  isPurchasable!: boolean;
}

export class PlanSaleDto extends ReasonField {
  @ApiProperty()
  @IsBoolean()
  isPurchasable!: boolean;
}
