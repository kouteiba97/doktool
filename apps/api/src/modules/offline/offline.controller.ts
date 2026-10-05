import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { ReferenceDocumentType } from '../../generated/prisma/enums.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentViewer, type Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { RequireFeature } from '../access/index.js';
import { PublishedTestCaseDto, PublishedVersionDto } from '../calculators/index.js';
import { SubstanceProfileDto } from '../pregnancy/index.js';
import { OfflineService } from './offline.service.js';

export class ManifestReferenceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReferenceDocumentType, enumName: 'ReferenceDocumentType' })
  type!: ReferenceDocumentType;

  @ApiProperty()
  titleFr!: string;

  @ApiProperty({ type: String, nullable: true })
  titleEn!: string | null;

  @ApiProperty()
  fileVersion!: number;

  @ApiProperty()
  sha256!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  pageCount!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ManifestCalculatorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  nameFr!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty({ type: String, nullable: true })
  category!: string | null;

  @ApiProperty({ type: PublishedVersionDto })
  published!: PublishedVersionDto;

  @ApiProperty({ type: [PublishedTestCaseDto], description: 'Run on the device before first use.' })
  testCases!: PublishedTestCaseDto[];
}

export class OfflineManifestDto {
  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ description: 'Compare with the stored value to show "update available".' })
  dataVersion!: string;

  @ApiProperty({ type: [ManifestReferenceDto] })
  referenceDocuments!: ManifestReferenceDto[];

  @ApiProperty({ type: [ManifestCalculatorDto] })
  calculators!: ManifestCalculatorDto[];
  @ApiProperty({ type: [SubstanceProfileDto], description: 'Opened profiles, in full (ADR-019).' })
  substances!: SubstanceProfileDto[];
}

@ApiTags('offline')
@Controller(`${USER_API_PREFIX}/offline`)
export class OfflineController {
  constructor(private readonly offline: OfflineService) {}

  /** Entitled content for the offline store. Locked for Demo and unpaid professionals. */
  @Get('manifest')
  @RequireFeature('offline.sync')
  @ApiOkResponse({ type: OfflineManifestDto })
  @ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
  async manifest(@CurrentViewer() viewer: Viewer): Promise<OfflineManifestDto> {
    const manifest = await this.offline.manifest(viewer);
    return {
      generatedAt: manifest.generatedAt.toISOString(),
      dataVersion: manifest.dataVersion,
      referenceDocuments: manifest.referenceDocuments.map((entry) => ({
        ...entry,
        updatedAt: entry.updatedAt.toISOString(),
      })),
      calculators: manifest.calculators.map((entry) => ({
        ...entry,
        published: PublishedVersionDto.from(entry.published),
        testCases: entry.testCases.map((testCase) => PublishedTestCaseDto.from(testCase)),
      })),
      substances: manifest.substances.map((profile) => SubstanceProfileDto.fromProfile(profile)),
    };
  }
}
