import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import { CurrentViewer, type Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { RequireFeature } from '../access/index.js';
import {
  ContentReportDto,
  SubstanceItemDto,
  SubstanceProfileDto,
  SubstanceHitDto,
  SubstanceQuery,
  SubstanceSearchDto,
  SubstanceSearchQuery,
} from './pregnancy.dto.js';
import { PregnancyService } from './pregnancy.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});
const uuid = new ParseUUIDPipe();

/**
 * « Grossesse · Allaitement » for the app (ADR-019). Locked substances stay listed with their
 * reason; only an AVAILABLE one returns its content. Works with user and demo tokens.
 */
@ApiTags('pregnancy')
@Controller(`${USER_API_PREFIX}/pregnancy/substances`)
@RequireFeature('pregnancy.view')
export class PregnancyController {
  constructor(private readonly pregnancy: PregnancyService) {}

  @Get()
  @ApiOkResponse({ type: [SubstanceItemDto] })
  @errors
  async list(
    @CurrentViewer() viewer: Viewer,
    @Query() query: SubstanceQuery,
  ): Promise<SubstanceItemDto[]> {
    return (await this.pregnancy.list(viewer, query.q)).map((item) => SubstanceItemDto.from(item));
  }

  /**
   * Server-side search (ADR-025): partial, accent-insensitive words of the name or a synonym,
   * bounded pages, with each period's conduct and evidence level when the profile is open.
   */
  @Get('search')
  @ApiOkResponse({ type: SubstanceSearchDto })
  @errors
  async search(
    @CurrentViewer() viewer: Viewer,
    @Query() query: SubstanceSearchQuery,
  ): Promise<SubstanceSearchDto> {
    const { items, total } = await this.pregnancy.search(viewer, {
      q: query.q ?? '',
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
    return { total, items: items.map((hit) => SubstanceHitDto.fromHit(hit)) };
  }

  /** The published profile; CONTENT_UNAVAILABLE (410) once disabled. */
  @Get(':id')
  @ApiOkResponse({ type: SubstanceProfileDto })
  @errors
  async get(
    @CurrentViewer() viewer: Viewer,
    @Param('id', uuid) id: string,
  ): Promise<SubstanceProfileDto> {
    return SubstanceProfileDto.fromProfile(await this.pregnancy.get(viewer, id));
  }

  /** « Signaler une erreur » on the pregnancy or the lactation block. */
  @Post(':id/reports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @errors
  async report(
    @CurrentViewer() viewer: Viewer,
    @Param('id', uuid) id: string,
    @Body() body: ContentReportDto,
  ): Promise<void> {
    await this.pregnancy.report(viewer, id, body);
  }
}
