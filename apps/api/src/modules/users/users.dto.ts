import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
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

  static from(record: MeRecord): MeDto {
    return {
      id: record.id,
      firstName: record.firstName,
      lastName: record.lastName,
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
