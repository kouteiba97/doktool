import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SearchEntityType } from '../../generated/prisma/enums.js';
import { ItemAccessDto } from '../access/index.js';
import { SEARCH_TYPES, type SearchType } from './ranking.js';
import type { SearchHit, SearchResult } from './search.service.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class SearchQuery {
  @ApiProperty({ minLength: 1, maxLength: 100, description: 'Never stored or logged.' })
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({
    enum: SEARCH_TYPES,
    enumName: 'SearchType',
    description: 'Only this group, up to 50 rows.',
  })
  @IsOptional()
  @IsIn(SEARCH_TYPES)
  type?: SearchType;
}

export class SearchHitDto {
  @ApiProperty({ enum: SEARCH_TYPES, enumName: 'SearchType' })
  type!: SearchType;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Calculators open by slug.' })
  slug!: string | null;

  @ApiProperty()
  titleFr!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  titleEn!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  purposeFr!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  purposeEn!: string | null;

  @ApiProperty({ type: ItemAccessDto })
  access!: ItemAccessDto;

  static from({ terms: _terms, ...hit }: SearchHit): SearchHitDto {
    return hit;
  }
}

export class SearchGroupDto {
  @ApiProperty({ enum: SEARCH_TYPES, enumName: 'SearchType' })
  type!: SearchType;

  @ApiProperty({ description: 'All matches of this type (« Voir les n résultats »).' })
  total!: number;

  @ApiProperty({ type: [SearchHitDto] })
  hits!: SearchHitDto[];
}

export class SearchResultDto {
  @ApiProperty({ type: [SearchGroupDto], description: 'Best group first.' })
  groups!: SearchGroupDto[];

  @ApiProperty({
    type: [String],
    description: '« Vouliez-vous dire » titles when nothing matched.',
  })
  suggestions!: string[];

  static from(result: SearchResult): SearchResultDto {
    return {
      groups: result.groups.map((group) => ({
        type: group.type,
        total: group.total,
        hits: group.hits.map((hit) => SearchHitDto.from(hit)),
      })),
      suggestions: result.suggestions,
    };
  }
}

export class SynonymsQuery {
  @ApiProperty({ enum: SearchEntityType, enumName: 'SearchEntityType' })
  @IsEnum(SearchEntityType)
  entityType!: SearchEntityType;
}

export class ReplaceSynonymsDto {
  @ApiProperty({
    type: [String],
    maxItems: 30,
    description: 'Lay terms, abbreviations, misspellings (FR and EN).',
  })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  terms!: string[];

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class SynonymsDto {
  @ApiProperty({ type: [String] })
  terms!: string[];
}
