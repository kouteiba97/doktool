import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDate,
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
  ValidateNested,
} from 'class-validator';
import {
  AdjustmentKind,
  ExpenseCategory,
  PaymentProvider,
  TransactionStatus,
} from '../../generated/prisma/enums.js';
import {
  LedgerPersonDto,
  LedgerPlanDto,
  type LedgerTransaction,
  planRef,
} from '../billing/index.js';
import type {
  AdjustmentWithActors,
  ExpenseWithActors,
  FinanceOverview,
  SeriesPoint,
} from './finance.service.js';
import {
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
  type FeeView,
  type Ledger,
} from './finance.policy.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

class ReasonField {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

// ─────────────────────────────── queries ───────────────────────────────

export class PeriodQuery {
  @ApiProperty({ format: 'date-time', description: 'Start of the period (inclusive).' })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({ format: 'date-time', description: 'End of the period (exclusive).' })
  @Type(() => Date)
  @IsDate()
  to!: Date;
}

export class ReportQuery extends PeriodQuery {
  @ApiPropertyOptional({ enum: ['FR', 'EN'], default: 'FR' })
  @IsOptional()
  @IsIn(['FR', 'EN'])
  locale?: 'FR' | 'EN';
}

export class TransactionQuery {
  @ApiPropertyOptional({ enum: TransactionStatus, enumName: 'TransactionStatus' })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ enum: PaymentProvider, enumName: 'PaymentProvider' })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({ example: 'PRO_MONTHLY' })
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/)
  planCode?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'Exact DT-… number or provider reference.' })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id of the last row of the previous page.' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

// ─────────────────────────────── bodies ───────────────────────────────

export class FeeRateBody extends ReasonField {
  @ApiProperty({
    minimum: 0,
    maximum: 10000,
    description: 'Percentage of the amount in basis points (1.5 % = 150).',
  })
  @IsInt()
  @Min(0)
  @Max(10_000)
  rateBps!: number;

  @ApiProperty({ minimum: 0, description: 'Fixed part per payment, in centimes.' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  fixedMinor!: number;
}

export class NewExpenseBody extends ReasonField {
  @ApiProperty({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @ApiProperty({ maxLength: 200 })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @ApiProperty({ minimum: 1, description: 'Centimes.' })
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amountMinor!: number;

  @ApiProperty({ format: 'date', example: '2026-09-01' })
  @Type(() => Date)
  @IsDate()
  incurredOn!: Date;
}

export class VoidExpenseBody extends ReasonField {}

export class FeeSettlementItem {
  @ApiProperty({ example: 'DT-2026-001842' })
  @Matches(/^DT-[0-9]{4}-[0-9]{6}$/)
  transactionId!: string;

  @ApiProperty({ minimum: 0, description: 'Actual provider fee, in centimes.' })
  @IsInt()
  @Min(0)
  feesMinor!: number;
}

export class FeeSettlementBody extends ReasonField {
  @ApiProperty({ type: [FeeSettlementItem], maxItems: 500 })
  @ValidateNested({ each: true })
  @Type(() => FeeSettlementItem)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  items!: FeeSettlementItem[];
}

export class AdjustmentBody {
  @ApiProperty({ enum: AdjustmentKind, enumName: 'AdjustmentKind' })
  @IsEnum(AdjustmentKind)
  kind!: AdjustmentKind;

  @ApiProperty({ description: 'Signed amount in centimes; negative for a reversal.' })
  @IsInt()
  @Min(-100_000_000)
  @Max(100_000_000)
  amountMinor!: number;

  @ApiProperty({ enum: ADJUSTMENT_REASONS, enumName: 'AdjustmentReason' })
  @IsIn(ADJUSTMENT_REASONS)
  reasonCode!: AdjustmentReason;

  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;
}

export class ApproveAdjustmentBody extends ReasonField {}

// ─────────────────────────────── responses ───────────────────────────────

export class ActorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

export class FeeViewDto {
  @ApiProperty() feesMinor!: number;
  @ApiProperty({ description: 'The provider has not settled the actual fee yet (« estimé »).' })
  estimated!: boolean;
  @ApiProperty({ description: 'No fee rate is configured for this provider.' })
  rateMissing!: boolean;

  static from(view: FeeView): FeeViewDto {
    return { ...view };
  }
}

export class AdminTransactionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'DT-2026-001842' }) transactionId!: string;
  @ApiProperty({ type: LedgerPersonDto }) user!: LedgerPersonDto;
  @ApiProperty({ type: LedgerPlanDto }) plan!: LedgerPlanDto;
  @ApiProperty({ format: 'uuid' }) subscriptionId!: string;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: PaymentProvider, enumName: 'PaymentProvider' })
  paymentProvider!: PaymentProvider;
  @ApiProperty({ type: String, nullable: true }) providerReference!: string | null;
  @ApiProperty({ enum: TransactionStatus, enumName: 'TransactionStatus' })
  status!: TransactionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) paymentDate!: string | null;
  @ApiProperty({ type: FeeViewDto, nullable: true, description: 'Succeeded payments only.' })
  fees!: FeeViewDto | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Amount − fees (succeeded payments only).',
  })
  netAmountMinor!: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(row: LedgerTransaction, fees: FeeView | null): AdminTransactionDto {
    return {
      id: row.id,
      transactionId: row.transactionId,
      user: row.user,
      plan: planRef(row.plan),
      subscriptionId: row.subscriptionId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      paymentProvider: row.paymentProvider,
      providerReference: row.providerReference,
      status: row.status,
      paymentDate: row.paymentDate?.toISOString() ?? null,
      fees: fees ? FeeViewDto.from(fees) : null,
      netAmountMinor: fees ? row.amountMinor - fees.feesMinor : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export class AdjustmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AdjustmentKind, enumName: 'AdjustmentKind' }) kind!: AdjustmentKind;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() reasonCode!: string;
  @ApiProperty() reasonNote!: string;
  @ApiProperty({ type: ActorDto }) requestedBy!: ActorDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: ActorDto, nullable: true }) approvedBy!: ActorDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) approvedAt!: string | null;

  static from(row: AdjustmentWithActors): AdjustmentDto {
    return {
      id: row.id,
      kind: row.kind,
      amountMinor: row.amountMinor,
      reasonCode: row.reasonCode,
      reasonNote: row.reasonNote,
      requestedBy: row.requestedBy,
      createdAt: row.createdAt.toISOString(),
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
    };
  }
}

export class HistoryEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty() actorType!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}

export class AdminTransactionDetailDto extends AdminTransactionDto {
  @ApiProperty({ description: 'Provider details stored with the payment (no card data).' })
  metadata!: Record<string, unknown>;
  @ApiProperty({ type: [AdjustmentDto] }) adjustments!: AdjustmentDto[];
  @ApiProperty({ type: [HistoryEntryDto] }) history!: HistoryEntryDto[];
}

export class FeeRateDto {
  @ApiProperty({ enum: PaymentProvider, enumName: 'PaymentProvider' }) provider!: PaymentProvider;
  @ApiProperty({ type: Number, nullable: true }) rateBps!: number | null;
  @ApiProperty({ type: Number, nullable: true }) fixedMinor!: number | null;
  @ApiProperty({ type: ActorDto, nullable: true }) updatedBy!: ActorDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) updatedAt!: string | null;
}

export class ExpenseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ExpenseCategory, enumName: 'ExpenseCategory' }) category!: ExpenseCategory;
  @ApiProperty() label!: string;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ format: 'date' }) incurredOn!: string;
  @ApiProperty({ type: ActorDto }) createdBy!: ActorDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) voidedAt!: string | null;
  @ApiProperty({ type: ActorDto, nullable: true }) voidedBy!: ActorDto | null;
  @ApiProperty({ type: String, nullable: true }) voidReason!: string | null;

  static from(row: ExpenseWithActors): ExpenseDto {
    return {
      id: row.id,
      category: row.category,
      label: row.label,
      amountMinor: row.amountMinor,
      currency: row.currency,
      incurredOn: row.incurredOn.toISOString().slice(0, 10),
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      voidedAt: row.voidedAt?.toISOString() ?? null,
      voidedBy: row.voidedBy,
      voidReason: row.voidReason,
    };
  }
}

export class FeeSettlementResultDto {
  @ApiProperty() transactionId!: string;
  @ApiProperty({ enum: ['SETTLED', 'NOT_FOUND', 'NOT_SUCCEEDED', 'FEES_ABOVE_AMOUNT'] })
  outcome!: 'SETTLED' | 'NOT_FOUND' | 'NOT_SUCCEEDED' | 'FEES_ABOVE_AMOUNT';
}

export class LedgerDto {
  @ApiProperty({ description: 'Payments + approved exceptional adjustments.' }) grossMinor!: number;
  @ApiProperty() adjustmentsMinor!: number;
  @ApiProperty() feesMinor!: number;
  @ApiProperty({ description: 'Part of the fees still estimated.' }) estimatedFeesMinor!: number;
  @ApiProperty() netRevenueMinor!: number;
  @ApiProperty() expensesMinor!: number;
  @ApiProperty() netProfitMinor!: number;
  @ApiProperty() payments!: number;

  static from(ledger: Ledger): LedgerDto {
    return { ...ledger };
  }
}

export class PeriodDto {
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) to!: string;
}

export class SubscriptionFiguresDto {
  @ApiProperty() mrrMinor!: number;
  @ApiProperty({ description: 'MRR × 12, a projection.' }) arrMinor!: number;
  @ApiProperty() payingProfessionals!: number;
  @ApiProperty() started!: number;
  @ApiProperty() renewed!: number;
  @ApiProperty() ended!: number;
  @ApiProperty() previousStarted!: number;
  @ApiProperty() previousRenewed!: number;
  @ApiProperty() previousEnded!: number;
}

export class PlanRevenueDto {
  @ApiProperty() planCode!: string;
  @ApiProperty() grossMinor!: number;
  @ApiProperty() payments!: number;
}

export class SeriesPointDto {
  @ApiProperty({ format: 'date-time' }) start!: string;
  @ApiProperty({ description: 'The bucket is not over (« période en cours »).' }) partial!: boolean;
  @ApiProperty() grossMinor!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Plan code → gross.',
  })
  byPlan!: Record<string, number>;
  @ApiProperty() started!: number;
  @ApiProperty() renewed!: number;
  @ApiProperty() ended!: number;

  static from(point: SeriesPoint): SeriesPointDto {
    return { ...point, start: point.start.toISOString() };
  }
}

export class IncidentsDto {
  @ApiProperty() failedPayments!: number;
  @ApiProperty() stalePendingPayments!: number;
}

export class FinanceOverviewDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;
  @ApiProperty({ type: PeriodDto }) previous!: PeriodDto;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: ['DAY', 'WEEK', 'MONTH'] }) bucket!: 'DAY' | 'WEEK' | 'MONTH';
  @ApiProperty({ type: LedgerDto }) ledger!: LedgerDto;
  @ApiProperty({ type: LedgerDto }) previousLedger!: LedgerDto;
  @ApiProperty({ enum: PaymentProvider, enumName: 'PaymentProvider', isArray: true })
  feeRatesMissing!: PaymentProvider[];
  @ApiProperty({ type: SubscriptionFiguresDto }) subscriptions!: SubscriptionFiguresDto;
  @ApiProperty({ type: [PlanRevenueDto] }) revenueByPlan!: PlanRevenueDto[];
  @ApiProperty({ type: [SeriesPointDto] }) series!: SeriesPointDto[];
  @ApiProperty({ type: IncidentsDto }) incidents!: IncidentsDto;

  static from(overview: FinanceOverview): FinanceOverviewDto {
    const period = (value: { from: Date; to: Date }) => ({
      from: value.from.toISOString(),
      to: value.to.toISOString(),
    });
    return {
      period: period(overview.period),
      previous: period(overview.previous),
      currency: overview.currency,
      bucket: overview.bucket,
      ledger: LedgerDto.from(overview.ledger),
      previousLedger: LedgerDto.from(overview.previousLedger),
      feeRatesMissing: overview.feeRatesMissing,
      subscriptions: overview.subscriptions,
      revenueByPlan: overview.revenueByPlan,
      series: overview.series.map((point) => SeriesPointDto.from(point)),
      incidents: overview.incidents,
    };
  }
}
