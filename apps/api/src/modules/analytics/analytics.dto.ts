import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDate,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ProfessionalType, ReferenceDocumentType } from '../../generated/prisma/enums.js';
import { CLIENT_EVENT_TYPES, type ClientEventType, MAX_BATCH } from './analytics.policy.js';

// ─────────────────────────────── ingestion ───────────────────────────────

/** One event in an upload. */
export class AnalyticsEventDto {
  @ApiProperty({ enum: CLIENT_EVENT_TYPES, enumName: 'ClientAnalyticsEventType' })
  @IsIn(CLIENT_EVENT_TYPES)
  type!: ClientEventType;

  @ApiProperty({
    format: 'date-time',
    description: 'When it happened on the device (offline buffer).',
  })
  @Type(() => Date)
  @IsDate()
  occurredAt!: Date;

  @ApiPropertyOptional({ format: 'uuid', description: 'Reference model or calculator id.' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Counts, codes and flags of this event type only (section 16); never free text.',
  })
  @IsObject()
  properties!: Record<string, unknown>;
}

/** Body of POST /v1/analytics/events. */
export class AnalyticsBatchDto {
  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  @IsIn(['IOS', 'ANDROID'])
  platform!: 'IOS' | 'ANDROID';

  @ApiPropertyOptional({ example: '1.0.0+12' })
  @IsOptional()
  @Matches(/^[0-9A-Za-z.+-]{1,20}$/)
  appVersion?: string;

  @ApiPropertyOptional({ description: 'Offline data version the app runs on.' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z:._-]{1,64}$/)
  dataVersion?: string;

  @ApiProperty({ type: [AnalyticsEventDto], maxItems: MAX_BATCH })
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH)
  events!: AnalyticsEventDto[];
}

export class IngestRejectionsDto {
  @ApiPropertyOptional() PROPERTIES?: number;
  @ApiPropertyOptional() ENTITY?: number;
  @ApiPropertyOptional() TIME?: number;
  @ApiPropertyOptional() CONTEXT?: number;
}

/** Answer of an upload. */
export class IngestResultDto {
  @ApiProperty() accepted!: number;
  @ApiProperty({
    type: IngestRejectionsDto,
    description: 'Dropped events by reason (not retried).',
  })
  rejected!: IngestRejectionsDto;
}

// ─────────────────────────────── dashboards ───────────────────────────────

/** Period (from inclusive, to exclusive) and optional segment of a dashboard. */
export class DashboardQuery {
  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiPropertyOptional({ enum: ProfessionalType, enumName: 'ProfessionalType' })
  @IsOptional()
  @IsEnum(ProfessionalType)
  professionalType?: ProfessionalType;

  @ApiPropertyOptional({ example: 'CARDIOLOGY' })
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/)
  specialtyCode?: string;
}

const cell = {
  type: Number,
  nullable: true,
  description: 'null when fewer than 10 people (« < 10 »).',
};

export class TypeActivityDto {
  @ApiProperty({ enum: ProfessionalType, enumName: 'ProfessionalType' })
  professionalType!: ProfessionalType;
  @ApiProperty(cell) subjects!: number | null;
}

export class DayActivityDto {
  @ApiProperty({ format: 'date' }) day!: string;
  @ApiProperty(cell) subjects!: number | null;
}

export class UsageDashboardDto {
  @ApiProperty(cell) activeSubjects!: number | null;
  @ApiProperty(cell) previousActiveSubjects!: number | null;
  @ApiProperty({ type: [TypeActivityDto] }) byType!: TypeActivityDto[];
  @ApiProperty({ type: [DayActivityDto] }) daily!: DayActivityDto[];
  @ApiProperty({ type: [DayActivityDto] }) previousDaily!: DayActivityDto[];
}

export class ModelActivityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) titleFr!: string | null;
  @ApiProperty({ type: String, nullable: true }) titleEn!: string | null;
  @ApiProperty({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType', nullable: true })
  type!: ReferenceDocumentType | null;
  @ApiProperty(cell) opens!: number | null;
  @ApiProperty(cell) views!: number | null;
  @ApiProperty(cell) offlineViews!: number | null;
  @ApiProperty(cell) favorites!: number | null;
}

export class LibraryDashboardDto {
  @ApiProperty(cell) searches!: number | null;
  @ApiProperty(cell) searchesWithoutResult!: number | null;
  @ApiProperty({ type: [ModelActivityDto] }) models!: ModelActivityDto[];
}

export class CalculatorActivityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) nameFr!: string | null;
  @ApiProperty({ type: String, nullable: true }) nameEn!: string | null;
  @ApiProperty({ type: Number, nullable: true }) version!: number | null;
  @ApiProperty(cell) starts!: number | null;
  @ApiProperty(cell) completions!: number | null;
}

export class CalculatorsDashboardDto {
  @ApiProperty({ type: [CalculatorActivityDto] }) rows!: CalculatorActivityDto[];
}

export class OnboardingDashboardDto {
  @ApiProperty(cell) signUps!: number | null;
  @ApiProperty(cell) submitted!: number | null;
  @ApiProperty(cell) verified!: number | null;
  @ApiProperty(cell) rejected!: number | null;
}

export class PlanActivityDto {
  @ApiProperty() planCode!: string;
  @ApiProperty(cell) started!: number | null;
  @ApiProperty(cell) renewed!: number | null;
}

export class SubscriptionsDashboardDto {
  @ApiProperty(cell) planViews!: number | null;
  @ApiProperty({ type: [PlanActivityDto] }) byPlan!: PlanActivityDto[];
}

export class DemoModuleActivityDto {
  @ApiProperty() module!: string;
  @ApiProperty(cell) viewed!: number | null;
  @ApiProperty(cell) limitsMet!: number | null;
}

export class DemoDashboardDto {
  @ApiProperty(cell) started!: number | null;
  @ApiProperty(cell) converted!: number | null;
  @ApiProperty({ type: [DemoModuleActivityDto] }) modules!: DemoModuleActivityDto[];
}

export class FreshnessDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) latestEventAt!: string | null;
}
