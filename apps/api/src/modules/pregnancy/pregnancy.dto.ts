import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ClinicalSourceType,
  ContentReportReason,
  ProfileSection,
  ProfileVersionStatus,
} from '../../generated/prisma/enums.js';
import { ItemAccessDto } from '../access/index.js';
import type { AdminVersion } from './pregnancy-admin.service.js';
import { CONDUCTS, type ProfileContent } from './pregnancy.content.js';
import type { SourceView, SubstanceItem, SubstanceProfile } from './pregnancy.service.js';

const REASON_MIN = 3;
const REASON_MAX = 500;

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

class ReasonField {
  @ApiProperty({ minLength: REASON_MIN, maxLength: REASON_MAX, description: 'Audit log.' })
  @trimmed
  @IsString()
  @MinLength(REASON_MIN)
  @MaxLength(REASON_MAX)
  reason!: string;
}

export class PregnancyReasonDto extends ReasonField {}

export class ReviewCommentDto {
  @ApiProperty({ minLength: REASON_MIN, maxLength: 2000 })
  @trimmed
  @IsString()
  @MinLength(REASON_MIN)
  @MaxLength(2000)
  comment!: string;
}

// ───────────────────────────── profile content ─────────────────────────────
// Documentation of the structure validated by pregnancy.content.ts.

export class ProfileTextDto {
  @ApiProperty() fr!: string;
  @ApiPropertyOptional() en?: string;
}

export class ProfileEvidenceDto {
  @ApiProperty({
    minimum: 0,
    maximum: 4,
    description: '4 robustes · 3 modérées · 2 limitées · 1 très limitées · 0 absence de données',
  })
  level!: number;

  @ApiPropertyOptional({ type: ProfileTextDto })
  population?: ProfileTextDto;
}

export class ProfileConflictDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 2, maxItems: 2 })
  sourceIds!: string[];

  @ApiProperty({ type: ProfileTextDto, description: "The reviewers' synthesis." })
  synthesis!: ProfileTextDto;
}

export class PregnancyPeriodDto {
  @ApiProperty({ enum: CONDUCTS, enumName: 'Conduct', nullable: true })
  conduct!: (typeof CONDUCTS)[number] | null;

  @ApiPropertyOptional({ type: ProfileTextDto }) conductDetail?: ProfileTextDto;
  @ApiPropertyOptional({ type: ProfileTextDto }) riskContext?: ProfileTextDto;
  @ApiProperty({ type: ProfileEvidenceDto }) evidence!: ProfileEvidenceDto;
  @ApiPropertyOptional({ type: ProfileTextDto }) considerations?: ProfileTextDto;
}

export class PregnancyPeriodsDto {
  @ApiProperty({ type: PregnancyPeriodDto, nullable: true }) T1!: PregnancyPeriodDto | null;
  @ApiProperty({ type: PregnancyPeriodDto, nullable: true }) T2!: PregnancyPeriodDto | null;
  @ApiProperty({ type: PregnancyPeriodDto, nullable: true }) T3!: PregnancyPeriodDto | null;
  @ApiProperty({ type: PregnancyPeriodDto, nullable: true }) PERIPARTUM!: PregnancyPeriodDto | null;
}

export class PregnancyBlockDto {
  @ApiProperty({ type: PregnancyPeriodsDto }) periods!: PregnancyPeriodsDto;
  @ApiProperty({ type: [String], format: 'uuid' }) alternatives!: string[];
  @ApiPropertyOptional({ type: ProfileConflictDto }) conflict?: ProfileConflictDto;
}

export class LactationBlockDto {
  @ApiProperty({ enum: CONDUCTS, enumName: 'Conduct', nullable: true })
  conduct!: (typeof CONDUCTS)[number] | null;

  @ApiPropertyOptional({ type: ProfileTextDto }) conductText?: ProfileTextDto;
  @ApiPropertyOptional({ example: '0,5 – 1 %' }) relativeInfantDose?: string;
  @ApiPropertyOptional({ example: '1 – 1,5 h' }) maternalHalfLife?: string;
  @ApiPropertyOptional({ type: ProfileTextDto }) reportedEffects?: ProfileTextDto;
  @ApiPropertyOptional({ type: ProfileTextDto }) specialPopulations?: ProfileTextDto;
  @ApiProperty({ type: ProfileEvidenceDto }) evidence!: ProfileEvidenceDto;
  @ApiPropertyOptional({ type: ProfileTextDto }) considerations?: ProfileTextDto;
  @ApiProperty({ type: [String], format: 'uuid' }) alternatives!: string[];
  @ApiPropertyOptional({ type: ProfileConflictDto }) conflict?: ProfileConflictDto;
}

export class ProfileContentDto {
  @ApiProperty({ type: PregnancyBlockDto, nullable: true }) pregnancy!: PregnancyBlockDto | null;
  @ApiProperty({ type: LactationBlockDto, nullable: true }) lactation!: LactationBlockDto | null;
}

// ──────────────────────────────── for the app ────────────────────────────────

export class SubstanceQuery {
  @ApiPropertyOptional({ description: 'Words of the name or a synonym.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class SubstanceItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nameFr!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ type: [String] }) synonyms!: string[];
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ type: ItemAccessDto }) access!: ItemAccessDto;

  static from(item: SubstanceItem): SubstanceItemDto {
    return { ...item, publishedAt: item.publishedAt.toISOString() };
  }
}

export class ClinicalSourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) publisher!: string | null;
  @ApiProperty({ enum: ClinicalSourceType, enumName: 'ClinicalSourceType' })
  type!: ClinicalSourceType;
  @ApiProperty({ nullable: true, type: String }) edition!: string | null;
  @ApiProperty({ nullable: true, type: Number }) year!: number | null;
  @ApiProperty({ nullable: true, type: String }) url!: string | null;

  static from(source: SourceView): ClinicalSourceDto {
    return { ...source };
  }
}

export class SubstanceRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nameFr!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
}

export class SubstanceProfileDto extends SubstanceItemDto {
  @ApiProperty({
    type: ProfileContentDto,
    nullable: true,
    description: 'Null while the profile is locked for this viewer.',
  })
  content!: ProfileContentDto | null;

  @ApiProperty({ type: [SubstanceRefDto] }) alternatives!: SubstanceRefDto[];
  @ApiProperty({ type: [ClinicalSourceDto] }) sources!: ClinicalSourceDto[];
  @ApiProperty({ format: 'date-time' }) reviewedAt!: string;
  @ApiProperty() reviewerName!: string;
  @ApiProperty({ description: 'A newer version is in review; this one remains the reference.' })
  underReview!: boolean;

  static fromProfile(profile: SubstanceProfile): SubstanceProfileDto {
    return {
      ...SubstanceItemDto.from(profile),
      content: profile.content,
      alternatives: profile.alternatives,
      sources: profile.sources.map((source) => ClinicalSourceDto.from(source)),
      reviewedAt: profile.reviewedAt.toISOString(),
      reviewerName: profile.reviewerName,
      underReview: profile.underReview,
    };
  }
}

export class ContentReportDto {
  @ApiProperty({ enum: ProfileSection, enumName: 'ProfileSection' })
  @IsEnum(ProfileSection)
  section!: ProfileSection;

  @ApiProperty({ enum: ContentReportReason, enumName: 'ContentReportReason' })
  @IsEnum(ContentReportReason)
  reason!: ContentReportReason;

  @ApiPropertyOptional({ maxLength: 500, description: 'Never patient data.' })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(500)
  comment?: string;
}

// ─────────────────────────────── for Admin Web ───────────────────────────────

const ATC = /^[A-Z]([0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?)?$/;

export class CreateSubstanceDto extends ReasonField {
  @ApiProperty({ maxLength: 120 })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nameFr!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(120)
  nameEn?: string | null;

  @ApiPropertyOptional({ example: 'M01AE01', nullable: true, type: String })
  @IsOptional()
  @trimmed
  @Matches(ATC)
  atcCode?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  synonyms?: string[];
}

export class UpdateSubstanceDto extends ReasonField {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nameFr?: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(120)
  nameEn?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @trimmed
  @Matches(ATC)
  atcCode?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  synonyms?: string[];
}

/** Who sees a profile: the demo sample flag and enabling (grant `pregnancy.review`). */
export class SubstanceVisibilityDto extends ReasonField {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  demoSample?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class ProfilePersonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

export class ProfileVersionSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ProfileVersionStatus, enumName: 'ProfileVersionStatus' })
  status!: ProfileVersionStatus;
  @ApiProperty() changeReason!: string;
  @ApiProperty({ type: ProfilePersonDto }) authoredBy!: ProfilePersonDto;
  @ApiProperty({ type: ProfilePersonDto, nullable: true }) reviewedBy!: ProfilePersonDto | null;
  @ApiProperty({ nullable: true, type: String }) reviewComment!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) submittedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) publishedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;

  static from(row: {
    id: string;
    version: number;
    status: ProfileVersionStatus;
    changeReason: string;
    authoredBy: ProfilePersonDto;
    reviewedBy: ProfilePersonDto | null;
    reviewComment: string | null;
    submittedAt: Date | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ProfileVersionSummaryDto {
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      changeReason: row.changeReason,
      authoredBy: row.authoredBy,
      reviewedBy: row.reviewedBy,
      reviewComment: row.reviewComment,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

class ProfileVersionStateDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ProfileVersionStatus, enumName: 'ProfileVersionStatus' })
  status!: ProfileVersionStatus;
}

export class AdminSubstanceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nameFr!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) atcCode!: string | null;
  @ApiProperty({ type: [String] }) synonyms!: string[];
  @ApiProperty() demoSample!: boolean;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: ProfileVersionStateDto, nullable: true })
  published!: ProfileVersionStateDto | null;
  @ApiProperty({ type: ProfileVersionStateDto, nullable: true, description: 'Draft or review.' })
  open!: ProfileVersionStateDto | null;
  @ApiProperty() openReports!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;

  static from(row: {
    id: string;
    nameFr: string;
    nameEn: string | null;
    atcCode: string | null;
    synonyms: string[];
    demoSample: boolean;
    enabled: boolean;
    published: ProfileVersionStateDto | null;
    open: ProfileVersionStateDto | null;
    openReports: number;
    updatedAt: Date;
  }): AdminSubstanceDto {
    const state = (version: ProfileVersionStateDto | null) =>
      version ? { id: version.id, version: version.version, status: version.status } : null;
    return {
      id: row.id,
      nameFr: row.nameFr,
      nameEn: row.nameEn,
      atcCode: row.atcCode,
      synonyms: row.synonyms,
      demoSample: row.demoSample,
      enabled: row.enabled,
      published: state(row.published),
      open: state(row.open),
      openReports: row.openReports,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class AdminSubstanceDetailDto extends AdminSubstanceDto {
  @ApiProperty({ type: [ProfileVersionSummaryDto] }) versions!: ProfileVersionSummaryDto[];

  static fromDetail(
    row: Parameters<typeof AdminSubstanceDto.from>[0] & {
      versions: Parameters<typeof ProfileVersionSummaryDto.from>[0][];
    },
  ): AdminSubstanceDetailDto {
    return {
      ...AdminSubstanceDto.from(row),
      versions: row.versions.map((version) => ProfileVersionSummaryDto.from(version)),
    };
  }
}

export class AdminProfileVersionDto extends ProfileVersionSummaryDto {
  @ApiProperty({ type: SubstanceRefDto }) substance!: SubstanceRefDto;
  @ApiProperty({ type: ProfileContentDto }) content!: ProfileContentDto;
  @ApiProperty({ type: [ClinicalSourceDto] }) sources!: ClinicalSourceDto[];
  @ApiProperty({
    type: [String],
    description: 'What still prevents submission for review (empty = ready).',
  })
  problems!: string[];

  static fromVersion(row: AdminVersion): AdminProfileVersionDto {
    return {
      ...ProfileVersionSummaryDto.from(row),
      substance: row.substance,
      content: row.content as unknown as ProfileContent,
      sources: row.sources.map(({ source }) => ClinicalSourceDto.from(source)),
      problems: row.problems,
    };
  }
}

export class SaveProfileVersionDto {
  @ApiProperty({ type: ProfileContentDto, description: 'Validated against the profile structure.' })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiProperty({ type: [String], format: 'uuid', maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  sourceIds!: string[];
}

export class SourceInputDto {
  @ApiProperty({ maxLength: 200 })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(120)
  publisher?: string | null;

  @ApiProperty({ enum: ClinicalSourceType, enumName: 'ClinicalSourceType' })
  @IsEnum(ClinicalSourceType)
  type!: ClinicalSourceType;

  @ApiPropertyOptional({ maxLength: 40, nullable: true, type: String, example: '09/2026' })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(40)
  edition?: string | null;

  @ApiPropertyOptional({ minimum: 1900, maximum: 2100, nullable: true, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string | null;
}

export class ReportsQuery {
  @ApiPropertyOptional({ enum: ['open', 'all'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'all'])
  status?: 'open' | 'all';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  substanceId?: string;
}

export class AdminContentReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: SubstanceRefDto }) substance!: SubstanceRefDto;
  @ApiProperty({ nullable: true, type: Number }) version!: number | null;
  @ApiProperty({ enum: ProfileSection, enumName: 'ProfileSection' }) section!: ProfileSection;
  @ApiProperty({ enum: ContentReportReason, enumName: 'ContentReportReason' })
  reason!: ContentReportReason;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) resolvedAt!: string | null;
  @ApiProperty({ type: ProfilePersonDto, nullable: true }) resolvedBy!: ProfilePersonDto | null;
  @ApiProperty({ nullable: true, type: String }) resolution!: string | null;

  static from(row: {
    id: string;
    substance: SubstanceRefDto;
    version: { version: number } | null;
    section: ProfileSection;
    reason: ContentReportReason;
    comment: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedBy: ProfilePersonDto | null;
    resolution: string | null;
  }): AdminContentReportDto {
    return {
      id: row.id,
      substance: row.substance,
      version: row.version?.version ?? null,
      section: row.section,
      reason: row.reason,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.resolvedBy,
      resolution: row.resolution,
    };
  }
}

export class ResolveReportDto {
  @ApiProperty({ minLength: REASON_MIN, maxLength: REASON_MAX })
  @trimmed
  @IsString()
  @MinLength(REASON_MIN)
  @MaxLength(REASON_MAX)
  resolution!: string;
}
