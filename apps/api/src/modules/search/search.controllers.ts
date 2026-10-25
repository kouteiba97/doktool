import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX, USER_API_PREFIX } from '../../http/api-prefix.js';
import {
  CurrentViewer,
  type Viewer,
  ViewerAuthGuard,
} from '../../infrastructure/security/viewer-auth.guard.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import {
  ReplaceSynonymsDto,
  SearchQuery,
  SearchResultDto,
  SynonymsDto,
  SynonymsQuery,
} from './search.dto.js';
import { SearchService } from './search.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/** Global search of the app (section 12), for user and demo tokens. */
@ApiTags('search')
@Controller(USER_API_PREFIX)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** GET /v1/search: the global search of the app. */
  @Get('search')
  @UseGuards(ViewerAuthGuard)
  @ApiBearerAuth('user')
  @ApiBearerAuth('demo')
  @ApiOkResponse({ type: SearchResultDto })
  @errors
  async query(
    @CurrentViewer() viewer: Viewer,
    @Query() query: SearchQuery,
  ): Promise<SearchResultDto> {
    return SearchResultDto.from(await this.search.search(viewer, query.q, query.type));
  }
}

/**
 * Synonyms of a model (grant `library.write`) or a calculator (grant `calculators.draft`), checked
 * in the service since the grant depends on the entity type.
 */
@ApiTags('admin-search')
@Controller(`${ADMIN_API_PREFIX}/search/synonyms`)
export class SearchAdminController {
  constructor(private readonly search: SearchService) {}

  /** GET /admin/v1/search/synonyms: the synonyms of one model or calculator. */
  @Get(':entityId')
  @RequireGrants()
  @ApiOkResponse({ type: SynonymsDto })
  @errors
  async list(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('entityId', new ParseUUIDPipe()) entityId: string,
    @Query() query: SynonymsQuery,
  ): Promise<SynonymsDto> {
    return { terms: await this.search.synonymsFor(admin, query.entityType, entityId) };
  }

  /** PUT /admin/v1/search/synonyms: replaces them. */
  @Put(':entityId')
  @RequireGrants()
  @ApiOkResponse({ type: SynonymsDto })
  @errors
  async replace(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('entityId', new ParseUUIDPipe()) entityId: string,
    @Query() query: SynonymsQuery,
    @Body() body: ReplaceSynonymsDto,
    @Client() client: ClientInfo,
  ): Promise<SynonymsDto> {
    return {
      terms: await this.search.replaceSynonyms(admin, query.entityType, entityId, body, client),
    };
  }
}
