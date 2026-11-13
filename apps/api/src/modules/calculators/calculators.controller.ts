import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import {
  CurrentViewer,
  type Viewer,
  ViewerAuthGuard,
} from '../../infrastructure/security/viewer-auth.guard.js';
import {
  CalculatorDetailDto,
  CalculatorListQuery,
  CalculatorSummaryDto,
  EvaluateDto,
  EvaluationResponseDto,
  PublishedTestCaseDto,
  PublishedVersionDto,
} from './calculators.dto.js';
import { CalculatorsService } from './calculators.service.js';
import type { EvaluationInputs } from './engine/index.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/** Calculators for the app (section 28). Works with user and demo tokens. */
@ApiTags('calculators')
@Controller(`${USER_API_PREFIX}/calculators`)
@UseGuards(ViewerAuthGuard)
@ApiBearerAuth('user')
@ApiBearerAuth('demo')
export class CalculatorsController {
  constructor(private readonly calculators: CalculatorsService) {}

  /** GET /v1/calculators: the catalogue (optional search words). */
  @Get()
  @ApiOkResponse({ type: [CalculatorSummaryDto] })
  @errors
  async list(
    @CurrentViewer() viewer: Viewer,
    @Query() query: CalculatorListQuery,
  ): Promise<CalculatorSummaryDto[]> {
    return (await this.calculators.list(viewer, query.q)).map((summary) =>
      CalculatorSummaryDto.from(summary),
    );
  }

  /** The published version (definition, sources, review) when the calculator is available to the viewer. */
  @Get(':slug')
  @ApiOkResponse({ type: CalculatorDetailDto })
  @errors
  async get(
    @CurrentViewer() viewer: Viewer,
    @Param('slug') slug: string,
  ): Promise<CalculatorDetailDto> {
    const { summary, published, testCases } = await this.calculators.get(viewer, slug);
    return {
      ...CalculatorSummaryDto.from(summary),
      published: published ? PublishedVersionDto.from(published) : null,
      testCases: testCases.map((testCase) => PublishedTestCaseDto.from(testCase)),
    };
  }

  /** Authoritative evaluation of the current published version. Inputs are never stored. */
  @Post(':slug/versions/:version/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: EvaluationResponseDto })
  @errors
  async evaluate(
    @CurrentViewer() viewer: Viewer,
    @Param('slug') slug: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: EvaluateDto,
  ): Promise<EvaluationResponseDto> {
    const result = await this.calculators.evaluate(
      viewer,
      slug,
      version,
      body.inputs as EvaluationInputs,
    );
    return {
      evaluation: result.evaluation,
      versionId: result.versionId,
      definitionSha256: result.definitionSha256,
      engine: 'server',
      computedAt: new Date().toISOString(),
    };
  }
}
