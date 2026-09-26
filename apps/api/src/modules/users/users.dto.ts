import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  Language,
  ProfessionalType,
  ThemePreference,
  WeightUnit,
} from '../../generated/prisma/enums.js';
import type { MeRecord } from './users.service.js';

export class WilayaDto {
  @ApiProperty({ example: 16 })
  code!: number;

  @ApiProperty({ example: 'Alger' })
  name!: string;
}

/** What the sign-up screen shows and sends back (the server refuses a stale terms version). */
export class LegalDto {
  @ApiProperty({ example: '2026-09' })
  termsVersion!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  termsUrl!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  privacyUrl!: string | null;
}

export class ProfessionalProfileDto {
  @ApiProperty({ enum: ProfessionalType, enumName: 'ProfessionalType' })
  professionalType!: ProfessionalType;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  specialtyId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  institutionId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  universityId!: string | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 7 })
  academicYear!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 1 })
  residencyYear!: number | null;
}

export class PreferencesDto {
  @ApiProperty({ enum: Language, enumName: 'Language' })
  language!: Language;

  @ApiProperty({ enum: ThemePreference, enumName: 'ThemePreference' })
  theme!: ThemePreference;

  @ApiProperty({ enum: WeightUnit, enumName: 'WeightUnit', nullable: true })
  weightUnitDefault!: WeightUnit | null;
}

export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 280 })
  bio!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Signed URL of the profile photo (1 hour).',
  })
  avatarUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'E.164' })
  phone!: string | null;

  @ApiProperty()
  emailConfirmed!: boolean;

  @ApiProperty()
  phoneConfirmed!: boolean;

  @ApiProperty({ type: WilayaDto })
  wilaya!: WilayaDto;

  @ApiProperty({ type: ProfessionalProfileDto, nullable: true })
  professionalProfile!: ProfessionalProfileDto | null;

  @ApiProperty({ type: PreferencesDto })
  preferences!: PreferencesDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static from(record: MeRecord, avatarUrl: string | null): MeDto {
    return {
      id: record.id,
      firstName: record.firstName,
      lastName: record.lastName,
      bio: record.bio,
      avatarUrl,
      email: record.email,
      phone: record.phone,
      emailConfirmed: record.emailConfirmedAt !== null,
      phoneConfirmed: record.phoneConfirmedAt !== null,
      wilaya: record.wilaya,
      professionalProfile: record.professionalProfile,
      preferences: record.preference ?? {
        language: 'FR',
        theme: 'SYSTEM',
        weightUnitDefault: null,
      },
      createdAt: record.createdAt.toISOString(),
    };
  }
}

const trimmedText = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @trimmedText
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @trimmedText
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 280,
    description: 'null clears it.',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @trimmedText
  @IsString()
  @MaxLength(280)
  bio?: string | null;
}

export class PhotoUploadRequestDto {
  @ApiProperty({ description: 'image/jpeg or image/png.' })
  @IsString()
  contentType!: string;

  @ApiProperty({ description: 'Exact size in bytes (at most 8 MB).' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ description: 'Lower-case hex SHA-256 of the file.' })
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}

export class PhotoUploadHeadersDto {
  @ApiProperty({ name: 'Content-Type' })
  'Content-Type'!: string;

  @ApiProperty({ name: 'Content-Length' })
  'Content-Length'!: string;
}

export class PhotoUploadTicketDto {
  @ApiProperty({ format: 'uuid' })
  intentId!: string;

  @ApiProperty({ enum: ['PUT'] })
  method!: 'PUT';

  @ApiProperty({ description: 'Signed URL, valid 15 minutes.' })
  url!: string;

  @ApiProperty({ type: PhotoUploadHeadersDto, description: 'Send exactly these headers.' })
  headers!: PhotoUploadHeadersDto;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class PhotoUploadStartDto {
  @ApiProperty({ format: 'uuid' })
  imageId!: string;

  @ApiProperty({ type: PhotoUploadTicketDto })
  upload!: PhotoUploadTicketDto;
}

export class AttachPhotoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  intentId!: string;

  @ApiProperty({ format: 'uuid', description: 'The id returned with the upload.' })
  @IsUUID()
  imageId!: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: Language, enumName: 'Language' })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({ enum: ThemePreference, enumName: 'ThemePreference' })
  @IsOptional()
  @IsEnum(ThemePreference)
  theme?: ThemePreference;

  @ApiPropertyOptional({ enum: WeightUnit, enumName: 'WeightUnit', nullable: true })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(WeightUnit)
  weightUnitDefault?: WeightUnit | null;
}

export class SetProfessionalProfileDto {
  @ApiProperty({ enum: ProfessionalType, enumName: 'ProfessionalType' })
  @IsEnum(ProfessionalType)
  professionalType!: ProfessionalType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 7, description: 'Medical students only.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  academicYear?: number;

  @ApiPropertyOptional({ minimum: 1, description: 'Residents only.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  residencyYear?: number;
}
