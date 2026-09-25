import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  FileProcessingStatus,
  ReferenceDocumentStatus,
  ReferenceDocumentType,
} from '../../generated/prisma/enums.js';
import { ItemAccessDto } from '../access/index.js';
import type { UploadTicket } from '../storage/index.js';
import type { AdminDocumentRecord } from './reference-documents-admin.service.js';
import type { ReferenceItem } from './reference-documents.service.js';
import {
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  TITLE_MAX_LENGTH,
} from './reference-library.policy.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

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

export class ReasonDto extends ReasonField {}

class FileDeclaration {
  @ApiProperty({ example: 'angine_adulte.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ description: 'SHA-256 of the PDF, computed by Admin Web before upload (hex).' })
  @Matches(/^[0-9a-fA-F]{64}$/)
  sha256!: string;
}

export class RequestUploadDto extends FileDeclaration {
  @ApiProperty({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType' })
  @IsEnum(ReferenceDocumentType)
  type!: ReferenceDocumentType;
}

export class RequestReplacementDto extends FileDeclaration {}

export class CreateReferenceDocumentDto extends ReasonField {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  intentId!: string;

  @ApiProperty({ format: 'uuid', description: 'The id returned with the upload.' })
  @IsUUID()
  documentId!: string;

  @ApiProperty({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType' })
  @IsEnum(ReferenceDocumentType)
  type!: ReferenceDocumentType;

  @ApiProperty({
    maxLength: TITLE_MAX_LENGTH,
    description: 'Display title; does not change the PDF.',
  })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(TITLE_MAX_LENGTH)
  titleFr!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: TITLE_MAX_LENGTH })
  @IsOptional()
  @trimmed
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  titleEn?: string | null;

  @ApiProperty({ description: 'Part of the representative Demo set.' })
  @IsBoolean()
  demoSample!: boolean;

  @ApiProperty({ enum: ['ENABLED', 'DISABLED'], description: 'Applied once processing succeeds.' })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: 'ENABLED' | 'DISABLED';
}

export class ReplaceFileDto extends ReasonField {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  intentId!: string;

  @ApiProperty({ minimum: 2, description: 'The version returned with the replacement upload.' })
  @IsInt()
  @Min(2)
  version!: number;
}

export class UpdateReferenceDocumentDto extends ReasonField {
  @ApiPropertyOptional({ maxLength: TITLE_MAX_LENGTH })
  @IsOptional()
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(TITLE_MAX_LENGTH)
  titleFr?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: TITLE_MAX_LENGTH })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @trimmed
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  titleEn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  demoSample?: boolean;
}

export class AdminListQuery {
  @ApiPropertyOptional({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType' })
  @IsOptional()
  @IsEnum(ReferenceDocumentType)
  type?: ReferenceDocumentType;

  @ApiPropertyOptional({
    enum: ReferenceDocumentStatus,
    enumName: 'ReferenceDocumentStatus',
    description: 'Default: all but ARCHIVED.',
  })
  @IsOptional()
  @IsEnum(ReferenceDocumentStatus)
  status?: ReferenceDocumentStatus;
}

export class UploadHeadersDto {
  @ApiProperty({ name: 'Content-Type', example: 'application/pdf' })
  'Content-Type'!: string;

  @ApiProperty({ name: 'Content-Length', example: '184320' })
  'Content-Length'!: string;
}

export class UploadTicketDto {
  @ApiProperty({ format: 'uuid' })
  intentId!: string;

  @ApiProperty({ enum: ['PUT'] })
  method!: 'PUT';

  @ApiProperty({ description: 'Signed URL, valid 15 minutes.' })
  url!: string;

  @ApiProperty({ type: UploadHeadersDto, description: 'Send exactly these headers.' })
  headers!: UploadHeadersDto;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  static from(ticket: UploadTicket): UploadTicketDto {
    return {
      intentId: ticket.intentId,
      method: ticket.method,
      url: ticket.url,
      headers: ticket.headers,
      expiresAt: ticket.expiresAt.toISOString(),
    };
  }
}

export class UploadStartDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional({
    description: 'Display title proposed from the file name (new models only).',
  })
  suggestedTitle?: string;

  @ApiProperty({ type: UploadTicketDto })
  upload!: UploadTicketDto;
}

export class AdminFileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ type: Number, nullable: true })
  pageCount!: number | null;

  @ApiProperty({ type: String, nullable: true })
  sha256!: string | null;

  @ApiProperty({ enum: FileProcessingStatus, enumName: 'FileProcessingStatus' })
  processingStatus!: FileProcessingStatus;

  @ApiProperty({ type: String, nullable: true })
  processingError!: string | null;

  @ApiProperty({ format: 'date-time' })
  uploadedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  processedAt!: string | null;
}

export class AdminRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class AdminReferenceDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType' })
  type!: ReferenceDocumentType;

  @ApiProperty()
  titleFr!: string;

  @ApiProperty({ type: String, nullable: true })
  titleEn!: string | null;

  @ApiProperty()
  demoSample!: boolean;

  @ApiProperty({ enum: ReferenceDocumentStatus, enumName: 'ReferenceDocumentStatus' })
  status!: ReferenceDocumentStatus;

  @ApiProperty({
    enum: ReferenceDocumentStatus,
    enumName: 'ReferenceDocumentStatus',
    nullable: true,
  })
  statusAfterProcessing!: ReferenceDocumentStatus | null;

  @ApiProperty({ type: AdminFileDto, nullable: true })
  currentFile!: AdminFileDto | null;

  @ApiProperty({ type: [AdminFileDto], description: 'Every version, newest first.' })
  files!: AdminFileDto[];

  @ApiProperty({ type: AdminRefDto })
  createdBy!: AdminRefDto;

  @ApiProperty({ type: AdminRefDto })
  updatedBy!: AdminRefDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(record: AdminDocumentRecord): AdminReferenceDocumentDto {
    const file = (f: AdminDocumentRecord['files'][number]): AdminFileDto => ({
      id: f.id,
      version: f.version,
      sizeBytes: f.sizeBytes,
      pageCount: f.pageCount,
      sha256: f.sha256,
      processingStatus: f.processingStatus,
      processingError: f.processingError,
      uploadedAt: f.uploadedAt.toISOString(),
      processedAt: f.processedAt?.toISOString() ?? null,
    });
    return {
      id: record.id,
      type: record.type,
      titleFr: record.titleFr,
      titleEn: record.titleEn,
      demoSample: record.demoSample,
      status: record.status,
      statusAfterProcessing: record.statusAfterProcessing,
      currentFile: record.currentFile ? file(record.currentFile) : null,
      files: record.files.map(file),
      createdBy: record.createdBy,
      updatedBy: record.updatedBy,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

export class SignedUrlDto {
  @ApiProperty({ description: 'Signed, short-lived URL (10 minutes).' })
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class FileUrlDto extends SignedUrlDto {
  @ApiProperty()
  fileVersion!: number;

  @ApiProperty({ description: 'SHA-256 of the PDF, to verify an offline copy.' })
  sha256!: string;
}

export class ReferenceListQuery {
  @ApiProperty({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType' })
  @IsEnum(ReferenceDocumentType)
  type!: ReferenceDocumentType;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Filter on titles (accent- and case-insensitive).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ReferenceItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType' })
  type!: ReferenceDocumentType;

  @ApiProperty()
  titleFr!: string;

  @ApiProperty({ type: String, nullable: true, description: 'English UI falls back to titleFr.' })
  titleEn!: string | null;

  @ApiProperty()
  fileVersion!: number;

  @ApiProperty()
  pageCount!: number;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ format: 'date-time' })
  fileDate!: string;

  @ApiProperty({ type: ItemAccessDto })
  access!: ItemAccessDto;

  static from(item: ReferenceItem): ReferenceItemDto {
    return {
      id: item.id,
      type: item.type,
      titleFr: item.titleFr,
      titleEn: item.titleEn,
      fileVersion: item.fileVersion,
      pageCount: item.pageCount,
      sizeBytes: item.sizeBytes,
      fileDate: item.fileDate.toISOString(),
      access: item.access,
    };
  }
}
