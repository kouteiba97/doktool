import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FIELDS, STATUS_TARGETS } from './import/rows.js';
import {
  type BatchView,
  type CommitResult,
  ROW_FILTERS,
  type RowFilter,
} from './pregnancy-import.service.js';

const REASON = { min: 3, max: 500 };

export class ImportCellDto {
  @ApiProperty({ nullable: true, type: String }) text!: string | null;
  @ApiProperty({ nullable: true, type: String }) hyperlink!: string | null;
  @ApiProperty({
    description: 'The cell held a formula: its stored value was read, never evaluated.',
  })
  formula!: boolean;
}

export class ImportValuesDto {
  @ApiProperty({ nullable: true, type: String }) substance!: string | null;
  @ApiProperty({ nullable: true, type: String }) context!: string | null;
  @ApiProperty({ nullable: true, type: String }) period!: string | null;
  @ApiProperty({ nullable: true, type: String }) status!: string | null;
  @ApiProperty({ nullable: true, type: String }) alternative!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceTitle!: string | null;
}

export class ImportIssueDto {
  @ApiProperty({ enum: [...FIELDS, 'row'] }) field!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO'], enumName: 'ImportIssueSeverity' })
  severity!: string;
  @ApiProperty({ description: 'Stable code; Admin Web translates it.' }) code!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  })
  params?: Record<string, string | number>;
}

export class ImportRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Row number in the sheet.' }) rowNumber!: number;
  @ApiProperty({ type: [ImportCellDto] }) original!: ImportCellDto[];
  @ApiProperty({ type: ImportValuesDto }) values!: ImportValuesDto;
  @ApiProperty() edited!: boolean;
  @ApiProperty() excluded!: boolean;
  @ApiProperty({ enum: ['UPDATE', 'SKIP'], nullable: true, type: String }) resolution!:
    string | null;
  @ApiProperty({ type: [ImportIssueDto] }) issues!: ImportIssueDto[];
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) substanceId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) versionId!: string | null;
}

export class ImportStatusWordDto {
  @ApiProperty() key!: string;
  @ApiProperty({ description: 'The word as first written in the sheet.' }) sample!: string;
  @ApiProperty() rows!: number;
  @ApiProperty({
    enum: STATUS_TARGETS,
    enumName: 'ImportStatusTarget',
    nullable: true,
    type: String,
  })
  mappedTo!: string | null;
}

export class ImportSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() excluded!: number;
  @ApiProperty() valid!: number;
  @ApiProperty() errors!: number;
  @ApiProperty() warnings!: number;
  @ApiProperty() duplicates!: number;
  @ApiProperty() conflicts!: number;
  @ApiProperty() newSubstances!: number;
}

export class CommitResultDto {
  @ApiProperty() substancesCreated!: number;
  @ApiProperty() versionsCreated!: number;
  @ApiProperty() versionsUpdated!: number;
  @ApiProperty() sourcesCreated!: number;
  @ApiProperty() rowsWritten!: number;
  @ApiProperty() rowsSkipped!: number;
  @ApiProperty({ type: [String], format: 'uuid' }) versionIds!: string[];

  static from(result: CommitResult): CommitResultDto {
    return { ...result };
  }
}

class PersonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

export class ImportBatchDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() fileSha256!: string;
  @ApiProperty() fileBytes!: number;
  @ApiProperty() sheetName!: string;
  @ApiProperty({ enum: ['PREVIEW', 'COMMITTED', 'DISCARDED'], enumName: 'ImportStatus' })
  status!: string;
  @ApiProperty({ description: 'Send it back with every change; a stale value is refused.' })
  revision!: number;
  @ApiProperty() parserVersion!: string;
  @ApiProperty({ type: PersonDto }) uploadedBy!: PersonDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: PersonDto, nullable: true }) committedBy!: PersonDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) committedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) discardedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({ type: CommitResultDto, nullable: true }) result!: CommitResultDto | null;
}

export class ImportPreviewDto extends ImportBatchDto {
  @ApiProperty({ description: 'Sheet row of the header.' }) headerRow!: number;
  @ApiProperty({ type: 'array', items: { type: 'string', nullable: true } }) headers!: (
    string | null
  )[];
  @ApiProperty({ type: [String], description: 'Other sheets of the file, not read.' })
  otherSheets!: string[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: [...FIELDS, 'ignore'] },
    description: 'Column index → field.',
  })
  columns!: Record<string, string>;
  @ApiProperty({ type: [String], enum: FIELDS, description: 'Required fields no column maps to.' })
  missingColumns!: string[];
  @ApiProperty({ type: [ImportStatusWordDto] }) statuses!: ImportStatusWordDto[];
  @ApiProperty({ type: ImportSummaryDto }) summary!: ImportSummaryDto;
  @ApiProperty({ type: [ImportRowDto] }) rows!: ImportRowDto[];
  @ApiProperty({ description: 'Rows matching the filter.' }) rowsTotal!: number;

  static from(view: BatchView): ImportPreviewDto {
    const { batch } = view;
    const summary = batch.summary as { result?: CommitResult } | null;
    return {
      id: batch.id,
      fileName: batch.fileName,
      fileSha256: batch.fileSha256,
      fileBytes: batch.fileBytes,
      sheetName: batch.sheetName,
      status: batch.status,
      revision: batch.revision,
      parserVersion: batch.parserVersion,
      uploadedBy: batch.uploadedBy,
      createdAt: batch.createdAt.toISOString(),
      committedBy: batch.committedBy,
      committedAt: batch.committedAt?.toISOString() ?? null,
      discardedAt: batch.discardedAt?.toISOString() ?? null,
      reason: batch.reason,
      result: summary?.result ?? null,
      headerRow: view.headers.headerRow,
      headers: view.headers.names,
      otherSheets: view.headers.otherSheets,
      columns: batch.columns as Record<string, string>,
      missingColumns: view.missingColumns,
      statuses: view.statuses,
      summary: view.summary,
      rows: view.rows.items.map((row) => ({
        id: row.id,
        rowNumber: row.rowNumber,
        original: row.original as unknown as ImportCellDto[],
        values: row.values as unknown as ImportValuesDto,
        edited: row.edited,
        excluded: row.excluded,
        resolution: row.resolution,
        issues: row.issues,
        substanceId: row.substanceId,
        versionId: row.versionId,
      })),
      rowsTotal: view.rows.total,
    };
  }
}

export class ImportListItemDto extends ImportBatchDto {
  @ApiProperty() rows!: number;
}

export class ImportListDto {
  @ApiProperty({ type: [ImportListItemDto] }) items!: ImportListItemDto[];
  @ApiProperty() total!: number;
}

export class PageQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ImportRowsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ROW_FILTERS, enumName: 'ImportRowFilter', default: 'ALL' })
  @IsOptional()
  @IsIn(ROW_FILTERS)
  filter?: RowFilter;
}

export class SetImportMappingDto {
  @ApiProperty() @IsInt() revision!: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string', enum: [...FIELDS, 'ignore'] },
  })
  @IsOptional()
  @IsObject()
  columns?: Record<string, string>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string', enum: [...STATUS_TARGETS] },
    description: 'Normalised status word → conduct, or NONE for no badge.',
  })
  @IsOptional()
  @IsObject()
  statuses?: Record<string, string>;
}

export class ImportValuesPatchDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  substance?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  period?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  status?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  alternative?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceTitle?: string | null;
}

export class UpdateImportRowDto {
  @ApiProperty() @IsInt() revision!: number;

  @ApiPropertyOptional({ type: ImportValuesPatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImportValuesPatchDto)
  values?: ImportValuesPatchDto;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() excluded?: boolean;

  @ApiPropertyOptional({ enum: ['UPDATE', 'SKIP'], nullable: true, type: String })
  @IsOptional()
  @IsIn(['UPDATE', 'SKIP', null])
  resolution?: 'UPDATE' | 'SKIP' | null;
}

export class CommitImportDto {
  @ApiProperty() @IsInt() revision!: number;

  @ApiProperty({ minLength: REASON.min, maxLength: REASON.max, description: 'Audit log.' })
  @IsString()
  @MinLength(REASON.min)
  @MaxLength(REASON.max)
  reason!: string;
}

export class DiscardImportDto {
  @ApiProperty({ minLength: REASON.min, maxLength: REASON.max })
  @IsString()
  @MinLength(REASON.min)
  @MaxLength(REASON.max)
  reason!: string;
}

export class BulkVersionsDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  versionIds!: string[];

  @ApiProperty({
    minLength: REASON.min,
    maxLength: 2000,
    description: 'Reason (submit) or review comment (approve).',
  })
  @IsString()
  @MinLength(REASON.min)
  @MaxLength(2000)
  text!: string;
}

export class BulkItemResultDto {
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty() ok!: boolean;
  @ApiPropertyOptional() code?: string;
}

export class BulkResultDto {
  @ApiProperty({ type: [BulkItemResultDto] }) results!: BulkItemResultDto[];
}
