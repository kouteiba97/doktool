import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActivityKind, FavoriteTargetType } from '../../generated/prisma/enums.js';
import { ItemAccessDto } from '../access/index.js';
import type { ActivityRecord, FavoriteView } from './activity.service.js';

/** URL parameters naming a favorite: its type and id. */
export class FavoriteTargetParams {
  @ApiProperty({ enum: FavoriteTargetType, enumName: 'FavoriteTargetType' })
  @IsEnum(FavoriteTargetType)
  targetType!: FavoriteTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId!: string;
}

/** The item a favorite points at, with the caller's access to it. */
export class FavoriteItemDto {
  @ApiProperty({ enum: ['ORDONNANCE', 'CERTIFICATE', 'CALCULATOR', 'SUBSTANCE'] })
  kind!: 'ORDONNANCE' | 'CERTIFICATE' | 'CALCULATOR' | 'SUBSTANCE';

  @ApiPropertyOptional({ type: String, nullable: true })
  slug!: string | null;

  @ApiProperty()
  titleFr!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  titleEn!: string | null;

  @ApiProperty({ type: ItemAccessDto })
  access!: ItemAccessDto;
}

/** One favorite in GET /v1/me/favorites. */
export class FavoriteDto {
  @ApiProperty({ enum: FavoriteTargetType, enumName: 'FavoriteTargetType' })
  targetType!: FavoriteTargetType;

  @ApiProperty({ format: 'uuid' })
  targetId!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    type: FavoriteItemDto,
    nullable: true,
    description: 'Null when no longer available (« N’est plus disponible » with « Retirer »).',
  })
  item!: FavoriteItemDto | null;

  static from(view: FavoriteView): FavoriteDto {
    return { ...view, createdAt: view.createdAt.toISOString() };
  }
}

/** One history entry sent by the app. */
export class ActivityEntryDto {
  @ApiProperty({ enum: ActivityKind, enumName: 'ActivityKind' })
  @IsEnum(ActivityKind)
  kind!: ActivityKind;

  @ApiPropertyOptional({ enum: FavoriteTargetType, enumName: 'FavoriteTargetType' })
  @IsOptional()
  @IsEnum(FavoriteTargetType)
  targetType?: FavoriteTargetType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'SEARCH only. Kept for the person only.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  queryText?: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  occurredAt!: string;
}

/** Body of POST /v1/me/activity: a batch of entries from one device. */
export class RecordActivityDto {
  @ApiProperty({ description: 'Installation id of the device that recorded the entries.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  deviceId!: string;

  @ApiProperty({ type: [ActivityEntryDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ActivityEntryDto)
  entries!: ActivityEntryDto[];
}

/** Filters of GET /v1/me/activity. */
export class ActivityQuery {
  @ApiPropertyOptional({ enum: ActivityKind, enumName: 'ActivityKind' })
  @IsOptional()
  @IsEnum(ActivityKind)
  kind?: ActivityKind;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Entries before this instant (paging).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  before?: string;
}

/** Filter of DELETE /v1/me/activity. */
export class ClearActivityQuery {
  @ApiPropertyOptional({
    enum: ActivityKind,
    enumName: 'ActivityKind',
    description: 'Only this kind.',
  })
  @IsOptional()
  @IsEnum(ActivityKind)
  kind?: ActivityKind;
}

/** One history entry returned to the app. */
export class ActivityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ActivityKind, enumName: 'ActivityKind' })
  kind!: ActivityKind;

  @ApiPropertyOptional({ enum: FavoriteTargetType, enumName: 'FavoriteTargetType', nullable: true })
  targetType!: FavoriteTargetType | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  targetId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  queryText!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  static from(record: ActivityRecord): ActivityDto {
    return { ...record, occurredAt: record.occurredAt.toISOString() };
  }
}
