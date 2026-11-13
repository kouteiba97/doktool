import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AuditActorType,
  FavoriteTargetType,
  ActivityKind,
  Language,
  ProfessionalType,
  SubscriptionStatus,
  UserStatus,
  VerificationStatus,
} from '../../generated/prisma/enums.js';
import { AccessProfileDto } from '../access/index.js';
import { AdminSubscriptionDto } from '../billing/index.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

/** A reason, required for every admin change (kept in the audit log). */
export class AdminReasonBody {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

// ─────────────────────────────── users ───────────────────────────────

/** Filters of the user list. */
export class UserQuery {
  @ApiPropertyOptional({ description: 'Words of the name, e-mail or phone.' })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ProfessionalType, enumName: 'ProfessionalType' })
  @IsOptional()
  @IsEnum(ProfessionalType)
  professionalType?: ProfessionalType;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class LocalizedNameDto {
  @ApiProperty() fr!: string;
  @ApiProperty() en!: string;
}

export class WilayaDto {
  @ApiProperty() code!: number;
  @ApiProperty() name!: string;
}

/** Verification state shown in the user list. */
export class VerificationStateDto {
  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  identity!: VerificationStatus;
  @ApiProperty({
    enum: VerificationStatus,
    enumName: 'VerificationStatus',
    description: 'Professional status, or student status for students.',
  })
  status!: VerificationStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) statusExpiresAt!:
    string | null;
}

/** One row of the user list. */
export class AdminUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' }) status!: UserStatus;
  @ApiProperty({ enum: ProfessionalType, enumName: 'ProfessionalType', nullable: true })
  professionalType!: ProfessionalType | null;
  @ApiProperty({ type: LocalizedNameDto, nullable: true }) specialty!: LocalizedNameDto | null;
  @ApiProperty({ type: String, nullable: true }) university!: string | null;
  @ApiProperty({ type: WilayaDto }) wilaya!: WilayaDto;
  @ApiProperty({ type: VerificationStateDto }) verification!: VerificationStateDto;
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus', nullable: true })
  subscription!: SubscriptionStatus | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastSeenAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

/** The facts the access profile was computed from (shown to explain it). */
export class AccessInputsDto {
  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' }) accountStatus!: UserStatus;
  @ApiProperty({ enum: ProfessionalType, enumName: 'ProfessionalType', nullable: true })
  professionalType!: ProfessionalType | null;
  @ApiProperty({ type: Number, nullable: true }) academicYear!: number | null;
  @ApiProperty({ type: VerificationStateDto }) verification!: VerificationStateDto;
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus', nullable: true })
  subscriptionStatus!: SubscriptionStatus | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) subscriptionEndsAt!:
    string | null;
}

export class FavoriteCountDto {
  @ApiProperty({ enum: FavoriteTargetType, enumName: 'FavoriteTargetType' })
  targetType!: FavoriteTargetType;
  @ApiProperty() count!: number;
}

export class HistoryCountDto {
  @ApiProperty({ enum: ActivityKind, enumName: 'ActivityKind' }) kind!: ActivityKind;
  @ApiProperty() count!: number;
}

export class ActivityCountsDto {
  @ApiProperty({ type: [FavoriteCountDto] }) favorites!: FavoriteCountDto[];
  @ApiProperty({ type: [HistoryCountDto] }) history!: HistoryCountDto[];
}

/** One audit log entry. */
export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ enum: AuditActorType, enumName: 'AuditActorType' }) actorType!: AuditActorType;
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Admin name when the actor is an admin.',
  })
  actorName!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ type: String, nullable: true }) entityId!: string | null;
  @ApiProperty({ nullable: true, description: 'JSON before the change.' }) before!: unknown;
  @ApiProperty({ nullable: true, description: 'JSON after the change.' }) after!: unknown;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
}

/** The user drawer. */
export class AdminUserDetailDto extends AdminUserDto {
  @ApiProperty({ enum: Language, enumName: 'Language', nullable: true }) language!: Language | null;
  @ApiProperty({ type: Number, nullable: true }) academicYear!: number | null;
  @ApiProperty({ type: Number, nullable: true }) residencyYear!: number | null;
  @ApiProperty({ type: String, nullable: true }) orderNumberMasked!: string | null;
  @ApiProperty({ type: String, nullable: true }) institution!: string | null;
  @ApiProperty({ type: AccessProfileDto }) access!: AccessProfileDto;
  @ApiProperty({ type: AccessInputsDto }) accessInputs!: AccessInputsDto;
  @ApiPropertyOptional({ type: [AdminSubscriptionDto], description: 'With `subscriptions.read`.' })
  subscriptions?: AdminSubscriptionDto[];
  @ApiProperty({ type: ActivityCountsDto }) activity!: ActivityCountsDto;
  @ApiProperty({ type: [AuditEntryDto] }) history!: AuditEntryDto[];
}

// ─────────────────────────────── audit ───────────────────────────────

/** Filters of the audit log and of its export. */
export class AuditQuery {
  @ApiPropertyOptional({ enum: AuditActorType, enumName: 'AuditActorType' })
  @IsOptional()
  @IsEnum(AuditActorType)
  actorType?: AuditActorType;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9a-f-]{36}$/)
  actorId?: string;

  @ApiPropertyOptional({ example: 'ReferenceDocument' })
  @IsOptional()
  @Matches(/^[A-Z][A-Za-z]{1,40}$/)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(80)
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Exact action, or a prefix ending with "." (e.g. "finance.").',
  })
  @IsOptional()
  @Matches(/^[a-z_]+(\.[a-z_]+)*\.?$/)
  action?: string;

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

  @ApiPropertyOptional({ description: 'Id of the last entry of the previous page.' })
  @IsOptional()
  @Matches(/^[0-9]{1,19}$/)
  before?: string;
}

// ─────────────────────────────── overview ───────────────────────────────

export class OverviewCaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) waitingSince!: string | null;
  @ApiProperty() personName!: string;
}

export class OverviewVersionDto {
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ format: 'uuid' }) calculatorId!: string;
  @ApiProperty() nameFr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class OverviewFileFailureDto {
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty() titleFr!: string;
  @ApiProperty() type!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) uploadedAt!: string;
}

/** The « Vue d'ensemble » page; each block is present only with the matching grant. */
export class OverviewDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'analytics.read; null = « < 10 ».',
  })
  activeUsers30d?: number | null;
  @ApiPropertyOptional({ description: 'verification.queue.read' }) pendingVerifications?: number;
  @ApiPropertyOptional({ description: 'verification.queue.read' }) slaBreaches?: number;
  @ApiPropertyOptional({ description: 'subscriptions.read' }) payingProfessionals?: number;
  @ApiPropertyOptional({ description: 'finance.read' }) netRevenue30dMinor?: number;
  @ApiPropertyOptional({ type: [OverviewCaseDto] }) oldestCases?: OverviewCaseDto[];
  @ApiPropertyOptional({ type: [OverviewVersionDto] }) versionsToReview?: OverviewVersionDto[];
  @ApiPropertyOptional({ type: [OverviewFileFailureDto] }) fileFailures?: OverviewFileFailureDto[];
  @ApiPropertyOptional({ description: 'transactions.read' }) failedPayments30d?: number;
  @ApiPropertyOptional({ description: 'transactions.read' }) stalePendingPayments?: number;
  @ApiPropertyOptional({ type: [AuditEntryDto], description: 'Latest content changes.' })
  latestChanges?: AuditEntryDto[];
  @ApiProperty({ description: 'Verification SLA in hours.' }) slaHours!: number;
}
