import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { PregnancyAdminService } from './pregnancy-admin.service.js';
import { BulkResultDto, BulkVersionsDto } from './pregnancy-import.dto.js';
import {
  AdminContentReportDto,
  AdminProfileVersionDto,
  AdminSubstanceDetailDto,
  AdminSubstanceDto,
  AdminSubstancesQuery,
  MergePreviewDto,
  MergePreviewQuery,
  MergeSubstanceDto,
  ClinicalSourceDto,
  CreateSubstanceDto,
  PregnancyReasonDto,
  ReportsQuery,
  ResolveReportDto,
  ReviewCommentDto,
  SaveProfileVersionDto,
  SourceInputDto,
  SubstanceVisibilityDto,
  UpdateSubstanceDto,
} from './pregnancy.dto.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});
const uuid = new ParseUUIDPipe();

/** « Grossesse · Allaitement » governance for Admin Web (ADR-019, grants `pregnancy.*`). */
@ApiTags('admin-pregnancy')
@Controller(`${ADMIN_API_PREFIX}/pregnancy`)
@errors
export class PregnancyAdminController {
  constructor(private readonly pregnancy: PregnancyAdminService) {}

  // ─────────────────────────────── substances ───────────────────────────────

  /** GET /admin/v1/pregnancy/substances. */
  @Get('substances')
  @RequireGrants('pregnancy.read')
  @ApiOkResponse({ type: [AdminSubstanceDto] })
  async list(@Query() query: AdminSubstancesQuery): Promise<AdminSubstanceDto[]> {
    return (await this.pregnancy.listSubstances(query)).map((row) => AdminSubstanceDto.from(row));
  }

  /** GET /admin/v1/pregnancy/substances/:id. */
  @Get('substances/:id')
  @RequireGrants('pregnancy.read')
  @ApiOkResponse({ type: AdminSubstanceDetailDto })
  async detail(@Param('id', uuid) id: string): Promise<AdminSubstanceDetailDto> {
    return this.detailDto(id);
  }

  /** POST /admin/v1/pregnancy/substances. */
  @Post('substances')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: AdminSubstanceDetailDto })
  async create(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: CreateSubstanceDto,
    @Client() client: ClientInfo,
  ): Promise<AdminSubstanceDetailDto> {
    const created = await this.pregnancy.createSubstance(admin, body, client);
    return this.detailDto(created.id);
  }

  /** Names, ATC and synonyms. */
  @Patch('substances/:id')
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: AdminSubstanceDetailDto })
  async update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: UpdateSubstanceDto,
    @Client() client: ClientInfo,
  ): Promise<AdminSubstanceDetailDto> {
    await this.pregnancy.updateSubstance(admin, id, body, client);
    return this.detailDto(id);
  }

  /** Who sees the profile: demo sample, enabled. A reviewer's decision. */
  @Patch('substances/:id/visibility')
  @RequireGrants('pregnancy.review')
  @ApiOkResponse({ type: AdminSubstanceDetailDto })
  async visibility(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: SubstanceVisibilityDto,
    @Client() client: ClientInfo,
  ): Promise<AdminSubstanceDetailDto> {
    await this.pregnancy.updateSubstance(admin, id, body, client);
    return this.detailDto(id);
  }

  // ──────────────────────────────── versions ────────────────────────────────

  /** POST …/substances/:id/versions: a new draft profile. */
  @Post('substances/:id/versions')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: AdminProfileVersionDto })
  async createVersion(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: PregnancyReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminProfileVersionDto> {
    return AdminProfileVersionDto.fromVersion(
      await this.pregnancy.createVersion(admin, id, body.reason, client),
    );
  }

  /** What merging this duplicate into another substance would change, and what prevents it. */
  @Get('substances/:id/merge-preview')
  @RequireGrants('pregnancy.review')
  @ApiOkResponse({ type: MergePreviewDto })
  async mergePreview(
    @Param('id', uuid) id: string,
    @Query() query: MergePreviewQuery,
  ): Promise<MergePreviewDto> {
    return this.pregnancy.mergePreview(id, query.into);
  }

  /** Merges a duplicate into the substance to keep (ADR-027). */
  @Post('substances/:id/merge')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.review')
  @ApiOkResponse({ type: AdminSubstanceDetailDto })
  async merge(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: MergeSubstanceDto,
    @Client() client: ClientInfo,
  ): Promise<AdminSubstanceDetailDto> {
    await this.pregnancy.merge(admin, id, body, client);
    return this.detailDto(id);
  }

  /** Undoes a merge; the duplicate stays archived until a reviewer shows it again. */
  @Post('substances/:id/unmerge')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.review')
  @ApiOkResponse({ type: AdminSubstanceDetailDto })
  async unmerge(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: PregnancyReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminSubstanceDetailDto> {
    await this.pregnancy.unmerge(admin, id, body.reason, client);
    return this.detailDto(id);
  }

  /** Submits several drafts for review (e.g. after an import); each is checked on its own. */
  @Post('versions/submit-many')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: BulkResultDto })
  async submitMany(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: BulkVersionsDto,
    @Client() client: ClientInfo,
  ): Promise<BulkResultDto> {
    return {
      results: await this.pregnancy.many(body.versionIds, (id) =>
        this.pregnancy.submit(admin, id, body.text, client),
      ),
    };
  }

  /** Approves several versions in review; author ≠ reviewer and sign-offs apply to each. */
  @Post('versions/approve-many')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.review')
  @ApiOkResponse({ type: BulkResultDto })
  async approveMany(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: BulkVersionsDto,
    @Client() client: ClientInfo,
  ): Promise<BulkResultDto> {
    return {
      results: await this.pregnancy.many(body.versionIds, (id) =>
        this.pregnancy.approve(admin, id, body.text, client),
      ),
    };
  }

  /** GET /admin/v1/pregnancy/versions/:versionId. */
  @Get('versions/:versionId')
  @RequireGrants('pregnancy.read')
  @ApiOkResponse({ type: AdminProfileVersionDto })
  async version(@Param('versionId', uuid) versionId: string): Promise<AdminProfileVersionDto> {
    return AdminProfileVersionDto.fromVersion(await this.pregnancy.version(versionId));
  }

  /** PUT …/versions/:versionId: saves the draft's content and sources. */
  @Put('versions/:versionId')
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: AdminProfileVersionDto })
  async save(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: SaveProfileVersionDto,
    @Client() client: ClientInfo,
  ): Promise<AdminProfileVersionDto> {
    return AdminProfileVersionDto.fromVersion(
      await this.pregnancy.saveVersion(admin, versionId, body, client),
    );
  }

  /** POST …/versions/:versionId/submit. */
  @Post('versions/:versionId/submit')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: AdminProfileVersionDto })
  async submit(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: PregnancyReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminProfileVersionDto> {
    return AdminProfileVersionDto.fromVersion(
      await this.pregnancy.submit(admin, versionId, body.reason, client),
    );
  }

  /** Approve and publish (never the author); the previous version is superseded. */
  @Post('versions/:versionId/approve')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.review')
  @ApiOkResponse({ type: AdminProfileVersionDto })
  async approve(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: ReviewCommentDto,
    @Client() client: ClientInfo,
  ): Promise<AdminProfileVersionDto> {
    return AdminProfileVersionDto.fromVersion(
      await this.pregnancy.approve(admin, versionId, body.comment, client),
    );
  }

  /** POST …/versions/:versionId/request-changes. */
  @Post('versions/:versionId/request-changes')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.review')
  @ApiOkResponse({ type: AdminProfileVersionDto })
  async requestChanges(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: ReviewCommentDto,
    @Client() client: ClientInfo,
  ): Promise<AdminProfileVersionDto> {
    return AdminProfileVersionDto.fromVersion(
      await this.pregnancy.requestChanges(admin, versionId, body.comment, client),
    );
  }

  /** DELETE …/versions/:versionId: deletes a draft. */
  @Delete('versions/:versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('pregnancy.draft')
  @ApiNoContentResponse()
  async discard(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: PregnancyReasonDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.pregnancy.discard(admin, versionId, body.reason, client);
  }

  // ───────────────────────────────── sources ─────────────────────────────────

  /** GET /admin/v1/pregnancy/sources. */
  @Get('sources')
  @RequireGrants('pregnancy.read')
  @ApiOkResponse({ type: [ClinicalSourceDto] })
  async sources(): Promise<ClinicalSourceDto[]> {
    return (await this.pregnancy.listSources()).map((source) => ClinicalSourceDto.from(source));
  }

  /** POST /admin/v1/pregnancy/sources. */
  @Post('sources')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: ClinicalSourceDto })
  async createSource(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: SourceInputDto,
    @Client() client: ClientInfo,
  ): Promise<ClinicalSourceDto> {
    return ClinicalSourceDto.from(await this.pregnancy.createSource(admin, body, client));
  }

  /** PATCH /admin/v1/pregnancy/sources/:id. */
  @Put('sources/:id')
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: ClinicalSourceDto })
  async updateSource(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: SourceInputDto,
    @Client() client: ClientInfo,
  ): Promise<ClinicalSourceDto> {
    return ClinicalSourceDto.from(await this.pregnancy.updateSource(admin, id, body, client));
  }

  // ───────────────────────────────── reports ─────────────────────────────────

  /** GET /admin/v1/pregnancy/reports. */
  @Get('reports')
  @RequireGrants('pregnancy.read')
  @ApiOkResponse({ type: [AdminContentReportDto] })
  async reports(@Query() query: ReportsQuery): Promise<AdminContentReportDto[]> {
    const rows = await this.pregnancy.listReports({
      open: (query.status ?? 'open') === 'open',
      substanceId: query.substanceId,
    });
    return rows.map((row) => AdminContentReportDto.from(row));
  }

  /** POST /admin/v1/pregnancy/reports/:id/resolve. */
  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('pregnancy.draft')
  @ApiNoContentResponse()
  async resolve(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: ResolveReportDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.pregnancy.resolveReport(admin, id, body.resolution, client);
  }

  /** The substance drawer response. */
  private async detailDto(id: string): Promise<AdminSubstanceDetailDto> {
    const row = await this.pregnancy.substance(id);
    const published = row.versions.find((version) => version.status === 'PUBLISHED') ?? null;
    const open =
      row.versions.find((version) =>
        ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'].includes(version.status),
      ) ?? null;
    return AdminSubstanceDetailDto.fromDetail({ ...row, published, open });
  }
}
