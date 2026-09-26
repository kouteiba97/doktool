import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AccessTier,
  CalculatorSourceRole,
  CalculatorStatus,
  CalculatorTestOutcome,
  CalculatorVersionStatus,
} from '../../generated/prisma/enums.js';
import { ItemAccessDto } from '../access/index.js';
import type { CalculatorRecord, VersionRecord } from './calculators-admin.service.js';
import {
  NAME_MAX_LENGTH,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  SLUG_PATTERN,
} from './calculators.policy.js';
import type {
  CalculatorSummary,
  PublishedVersion,
  PublishedTestCase,
} from './calculators.service.js';
import type { Evaluation } from './engine/index.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const DEFINITION_DOC = {
  type: 'object',
  additionalProperties: true,
  description: 'Calculator definition, schema version 1 (docs/adr/ADR-012-calculator-engine.md).',
} as const;
const INPUTS_DOC = {
  type: 'object',
  additionalProperties: { type: 'object' },
  description:
    'Input key → { value: number | string | boolean, unit?: string } (units as declared).',
  example: { weight: { value: 70, unit: 'kg' } },
} as const;

// ─────────────────────────── requests ───────────────────────────

class ReasonField {
  @ApiProperty({
    minLength: REASON_MIN_LENGTH,
    maxLength: REASON_MAX_LENGTH,
    description: 'Recorded in the audit log.',
  })
  @trimmed
  @IsString()
  @MinLength(REASON_MIN_LENGTH)
  @MaxLength(REASON_MAX_LENGTH)
  reason!: string;
}

export class CalculatorReasonDto extends ReasonField {}

/** One-line purpose shown under the name in lists and search. */
const PURPOSE_MAX_LENGTH = 160;

export class CreateCalculatorDto extends ReasonField {
  @ApiProperty({
    example: 'clairance-creatinine',
    description: 'Stable identifier used in links and favorites.',
  })
  @Matches(SLUG_PATTERN)
  @MaxLength(80)
  slug!: string;

  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX_LENGTH)
  nameFr!: string;

  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX_LENGTH)
  nameEn!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: PURPOSE_MAX_LENGTH,
    description: 'One-line purpose (lists, search).',
  })
  @IsOptional()
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(PURPOSE_MAX_LENGTH)
  purposeFr?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: PURPOSE_MAX_LENGTH })
  @IsOptional()
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(PURPOSE_MAX_LENGTH)
  purposeEn?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(60)
  category?: string | null;

  @ApiProperty({
    enum: AccessTier,
    enumName: 'AccessTier',
    description: 'STUDENT = students and professionals.',
  })
  @IsEnum(AccessTier)
  accessTier!: AccessTier;

  @ApiProperty()
  @IsBoolean()
  demoSample!: boolean;
}

export class UpdateCalculatorDto extends ReasonField {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX_LENGTH)
  nameFr?: string;

  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX_LENGTH)
  nameEn?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: PURPOSE_MAX_LENGTH,
    description: 'null clears it.',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(PURPOSE_MAX_LENGTH)
  purposeFr?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: PURPOSE_MAX_LENGTH,
    description: 'null clears it.',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(PURPOSE_MAX_LENGTH)
  purposeEn?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @trimmed
  @IsString()
  @MaxLength(60)
  category?: string | null;

  @ApiPropertyOptional({
    enum: AccessTier,
    enumName: 'AccessTier',
    description: 'Needs calculators.publish.',
  })
  @IsOptional()
  @IsEnum(AccessTier)
  accessTier?: AccessTier;

  @ApiPropertyOptional({ description: 'Needs calculators.publish.' })
  @IsOptional()
  @IsBoolean()
  demoSample?: boolean;
}

export class CreateVersionDto {
  @ApiPropertyOptional(DEFINITION_DOC)
  @ValidateIf((dto: CreateVersionDto) => dto.copyFromVersion === undefined)
  @IsObject()
  definition?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Copy definition, sources and test cases of this version number.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  copyFromVersion?: number;
}

export class SaveDefinitionDto {
  @ApiProperty(DEFINITION_DOC)
  @IsObject()
  definition!: Record<string, unknown>;
}

export class AddSourceDto {
  @ApiProperty({ enum: CalculatorSourceRole, enumName: 'CalculatorSourceRole' })
  @IsEnum(CalculatorSourceRole)
  role!: CalculatorSourceRole;

  @ApiProperty() @trimmed @IsString() @MinLength(1) @MaxLength(500) authors!: string;
  @ApiProperty() @trimmed @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @ApiProperty({ description: 'Journal or publisher.' })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  publisher!: string;
  @ApiProperty({ minimum: 1800, maximum: 2100 }) @IsInt() @Min(1800) @Max(2100) year!: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(200)
  doi?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(500)
  url?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(100)
  edition?: string | null;

  @ApiProperty({ description: 'Page, table or equation where the formula (or factor) appears.' })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  formulaLocation!: string;

  @ApiProperty({ format: 'date', example: '2026-09-20' })
  @Type(() => Date)
  @IsDate()
  accessedAt!: Date;
}

export class AddTestCaseDto {
  @ApiProperty(INPUTS_DOC)
  @IsObject()
  inputs!: Record<string, unknown>;

  @ApiProperty({ enum: CalculatorTestOutcome, enumName: 'CalculatorTestOutcome' })
  @IsEnum(CalculatorTestOutcome)
  expectedOutcome!: CalculatorTestOutcome;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Required for RESULT.' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  expectedValue?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    description: 'Required for RESULT.',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  tolerance?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Expected interpretation band code.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  expectedBand?: string | null;

  @ApiProperty({ example: 'Worked example, source p. 34' })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  origin!: string;
}

export class PublishDto {
  @ApiProperty({
    minLength: REASON_MIN_LENGTH,
    maxLength: REASON_MAX_LENGTH,
    description: 'Review note, shown in the governance view.',
  })
  @trimmed
  @IsString()
  @MinLength(REASON_MIN_LENGTH)
  @MaxLength(REASON_MAX_LENGTH)
  reviewNote!: string;
}

export class EvaluateDto {
  @ApiProperty(INPUTS_DOC)
  @IsObject()
  inputs!: Record<string, unknown>;
}

export class CalculatorListQuery {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

// ─────────────────────────── responses ───────────────────────────

export class PersonRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

export class SourceDto {
  @ApiProperty({ enum: CalculatorSourceRole, enumName: 'CalculatorSourceRole' })
  role!: CalculatorSourceRole;
  @ApiProperty() authors!: string;
  @ApiProperty() title!: string;
  @ApiProperty() publisher!: string;
  @ApiProperty() year!: number;
  @ApiProperty({ type: String, nullable: true }) doi!: string | null;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: String, nullable: true }) edition!: string | null;
  @ApiProperty() formulaLocation!: string;
}

export class AdminSourceDto extends SourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date' }) accessedAt!: string;
}

export class AdminTestCaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty(INPUTS_DOC) inputs!: Record<string, unknown>;
  @ApiProperty({ enum: CalculatorTestOutcome, enumName: 'CalculatorTestOutcome' })
  expectedOutcome!: CalculatorTestOutcome;
  @ApiProperty({ type: Number, nullable: true }) expectedValue!: number | null;
  @ApiProperty({ type: Number, nullable: true }) tolerance!: number | null;
  @ApiProperty({ type: String, nullable: true }) expectedBand!: string | null;
  @ApiProperty() origin!: string;
}

export class AdminVersionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: CalculatorVersionStatus, enumName: 'CalculatorVersionStatus' })
  status!: CalculatorVersionStatus;
  @ApiProperty(DEFINITION_DOC) definition!: unknown;
  @ApiProperty() definitionSha256!: string;
  @ApiProperty({ type: PersonRefDto }) authoredBy!: PersonRefDto;
  @ApiProperty({ type: PersonRefDto, nullable: true }) reviewedBy!: PersonRefDto | null;
  @ApiProperty({ type: String, nullable: true }) reviewNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reviewedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) engineVersion!: string | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Last engine run: passed, total, failed, engineVersion, ranAt, results[] (expected vs engine).',
  })
  testRun!: unknown;

  @ApiProperty({ type: [AdminSourceDto] }) sources!: AdminSourceDto[];
  @ApiProperty({ type: [AdminTestCaseDto] }) testCases!: AdminTestCaseDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;

  static from(version: VersionRecord): AdminVersionDto {
    return {
      id: version.id,
      version: version.version,
      status: version.status,
      definition: version.definition,
      definitionSha256: version.definitionSha256,
      authoredBy: version.authoredBy,
      reviewedBy: version.reviewedBy,
      reviewNote: version.reviewNote,
      reviewedAt: version.reviewedAt?.toISOString() ?? null,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      engineVersion: version.engineVersion,
      testRun: version.testRun,
      sources: version.sources.map((source) => ({
        id: source.id,
        role: source.role,
        authors: source.authors,
        title: source.title,
        publisher: source.publisher,
        year: source.year,
        doi: source.doi,
        url: source.url,
        edition: source.edition,
        formulaLocation: source.formulaLocation,
        accessedAt: source.accessedAt.toISOString().slice(0, 10),
      })),
      testCases: version.testCases.map((testCase) => ({
        id: testCase.id,
        inputs: testCase.inputs as Record<string, unknown>,
        expectedOutcome: testCase.expectedOutcome,
        expectedValue: testCase.expectedValue,
        tolerance: testCase.tolerance,
        expectedBand: testCase.expectedBand,
        origin: testCase.origin,
      })),
      createdAt: version.createdAt.toISOString(),
    };
  }
}

export class AdminCalculatorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameFr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ type: String, nullable: true }) purposeFr!: string | null;
  @ApiProperty({ type: String, nullable: true }) purposeEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty({ enum: AccessTier, enumName: 'AccessTier' }) accessTier!: AccessTier;
  @ApiProperty() demoSample!: boolean;
  @ApiProperty({ enum: CalculatorStatus, enumName: 'CalculatorStatus' }) status!: CalculatorStatus;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) currentVersionId!: string | null;
  @ApiProperty({ type: [AdminVersionDto], description: 'Version timeline, newest first.' })
  versions!: AdminVersionDto[];

  static from(record: CalculatorRecord): AdminCalculatorDto {
    return {
      id: record.id,
      slug: record.slug,
      nameFr: record.nameFr,
      nameEn: record.nameEn,
      purposeFr: record.purposeFr,
      purposeEn: record.purposeEn,
      category: record.category,
      accessTier: record.accessTier,
      demoSample: record.demoSample,
      status: record.status,
      currentVersionId: record.currentVersionId,
      versions: record.versions.map((version) => AdminVersionDto.from(version)),
    };
  }
}

export class LocalizedTextDto {
  @ApiProperty() fr!: string;
  @ApiProperty() en!: string;
}

export class BandDto {
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ['info', 'caution', 'warning', 'critical'] }) severity!: string;
  @ApiProperty({ type: LocalizedTextDto }) label!: LocalizedTextDto;
}

export class IssueDto {
  @ApiProperty() code!: string;
  @ApiPropertyOptional() input?: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: '{ min?, max?, unit } in canonical units.',
  })
  range?: Record<string, unknown>;
  @ApiPropertyOptional() ruleId?: string;
  @ApiPropertyOptional({ type: LocalizedTextDto }) message?: LocalizedTextDto;
}

export class ConversionDto {
  @ApiProperty() input!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, example: { value: 150, unit: 'lb' } })
  from!: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { value: 68.04, unit: 'kg' },
  })
  to!: Record<string, unknown>;
}

export class EvaluationDto {
  @ApiProperty({ enum: ['RESULT', 'INVALID', 'OUT_OF_VALIDATED_RANGE'] })
  outcome!: Evaluation['outcome'];
  @ApiPropertyOptional({
    description: 'RESULT only, unrounded (round at display with `decimals`).',
  })
  value?: number;
  @ApiPropertyOptional() unit?: string;
  @ApiPropertyOptional() decimals?: number;
  @ApiPropertyOptional({ type: BandDto, nullable: true }) band?: BandDto | null;
  @ApiPropertyOptional({ type: [IssueDto] }) issues?: IssueDto[];
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object' },
    description: 'Plausibility notes (RESULT only).',
  })
  notes?: unknown[];
  @ApiProperty({
    type: [ConversionDto],
    description: 'Every unit conversion applied (never silent).',
  })
  conversions!: ConversionDto[];
}

export class EvaluationResponseDto {
  @ApiProperty({ type: EvaluationDto }) evaluation!: EvaluationDto;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty() definitionSha256!: string;
  @ApiProperty({ enum: ['server'] }) engine!: 'server';
  @ApiProperty({ format: 'date-time' }) computedAt!: string;
}

export class CalculatorSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameFr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ type: String, nullable: true, description: 'One-line purpose.' }) purposeFr!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) purposeEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty({ description: 'Published version number (the "v3" chip).' }) version!: number;
  @ApiProperty({ type: ItemAccessDto }) access!: ItemAccessDto;

  static from(summary: CalculatorSummary): CalculatorSummaryDto {
    return { ...summary };
  }
}

export class ReviewDto {
  @ApiProperty() reviewedBy!: string;
  @ApiProperty({ format: 'date-time' }) reviewedAt!: string;
  @ApiProperty() testsPassed!: number;
}

export class PublishedVersionDto {
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty() version!: number;
  @ApiProperty(DEFINITION_DOC) definition!: unknown;
  @ApiProperty() definitionSha256!: string;
  @ApiProperty() engineVersion!: string;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ type: ReviewDto }) review!: ReviewDto;
  @ApiProperty({ type: [SourceDto] }) sources!: SourceDto[];

  static from(published: PublishedVersion): PublishedVersionDto {
    return {
      ...published,
      publishedAt: published.publishedAt.toISOString(),
      review: { ...published.review, reviewedAt: published.review.reviewedAt.toISOString() },
    };
  }
}

/** A reference test case of a published version; the device runs them before first use. */
export class PublishedTestCaseDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  inputs!: Record<string, unknown>;

  @ApiProperty({ enum: ['RESULT', 'INVALID', 'OUT_OF_VALIDATED_RANGE'] })
  expectedOutcome!: string;

  @ApiProperty({ type: Number, nullable: true })
  expectedValue!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  tolerance!: number | null;

  @ApiProperty({ type: String, nullable: true })
  expectedBand!: string | null;

  static from(testCase: PublishedTestCase): PublishedTestCaseDto {
    return {
      inputs: testCase.inputs,
      expectedOutcome: testCase.expectedOutcome,
      expectedValue: testCase.expectedValue,
      tolerance: testCase.tolerance,
      expectedBand: testCase.expectedBand,
    };
  }
}

export class CalculatorDetailDto extends CalculatorSummaryDto {
  @ApiProperty({
    type: PublishedVersionDto,
    nullable: true,
    description: 'Only when access is AVAILABLE.',
  })
  published!: PublishedVersionDto | null;

  @ApiProperty({
    type: [PublishedTestCaseDto],
    description:
      'Test cases of the published version (empty when locked); run on the device before use.',
  })
  testCases!: PublishedTestCaseDto[];
}
