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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { CalculatorsAdminService } from './calculators-admin.service.js';
import {
  AddSourceDto,
  AddTestCaseDto,
  AdminCalculatorDto,
  AdminVersionDto,
  CalculatorReasonDto,
  CreateCalculatorDto,
  CreateVersionDto,
  EvaluateDto,
  EvaluationDto,
  PublishDto,
  SaveDefinitionDto,
  UpdateCalculatorDto,
} from './calculators.dto.js';
import type { EvaluationInputs } from './engine/index.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});
const uuid = new ParseUUIDPipe();

/** Calculator governance for Admin Web (section 28, grants `calculators.*`). */
@ApiTags('admin-calculators')
@Controller(`${ADMIN_API_PREFIX}/calculators`)
export class CalculatorsAdminController {
  constructor(private readonly calculators: CalculatorsAdminService) {}

  /** GET /admin/v1/calculators. */
  @Get()
  @RequireGrants('calculators.read')
  @ApiOkResponse({ type: [AdminCalculatorDto] })
  @errors
  async list(): Promise<AdminCalculatorDto[]> {
    return (await this.calculators.list()).map((record) => AdminCalculatorDto.from(record));
  }

  /** GET /admin/v1/calculators/:id. */
  @Get(':id')
  @RequireGrants('calculators.read')
  @ApiOkResponse({ type: AdminCalculatorDto })
  @errors
  async detail(@Param('id', uuid) id: string): Promise<AdminCalculatorDto> {
    return AdminCalculatorDto.from(await this.calculators.detail(id));
  }

  /** POST /admin/v1/calculators. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminCalculatorDto })
  @errors
  async create(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: CreateCalculatorDto,
    @Client() client: ClientInfo,
  ): Promise<AdminCalculatorDto> {
    return AdminCalculatorDto.from(await this.calculators.createCalculator(admin, body, client));
  }

  /** Names and category; access tier and demo sample additionally need `calculators.publish`. */
  @Patch(':id')
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminCalculatorDto })
  @errors
  async update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: UpdateCalculatorDto,
    @Client() client: ClientInfo,
  ): Promise<AdminCalculatorDto> {
    return AdminCalculatorDto.from(
      await this.calculators.updateCalculator(admin, id, body, client),
    );
  }

  /** « Nouvelle version » (draft). */
  @Post(':id/versions')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async createVersion(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: CreateVersionDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(await this.calculators.createVersion(admin, id, body, client));
  }

  /** GET /admin/v1/calculators/versions/:versionId. */
  @Get('versions/:versionId')
  @RequireGrants('calculators.read')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async version(@Param('versionId', uuid) versionId: string): Promise<AdminVersionDto> {
    return AdminVersionDto.from(await this.calculators.version(versionId));
  }

  /** PUT …/versions/:versionId/definition: saves the draft's definition. */
  @Put('versions/:versionId/definition')
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async saveDefinition(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: SaveDefinitionDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      await this.calculators.saveDefinition(admin, versionId, body.definition, client),
    );
  }

  /** POST …/versions/:versionId/sources. */
  @Post('versions/:versionId/sources')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async addSource(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: AddSourceDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(await this.calculators.addSource(admin, versionId, body, client));
  }

  /** DELETE …/versions/:versionId/sources/:sourceId. */
  @Delete('versions/:versionId/sources/:sourceId')
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async removeSource(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Param('sourceId', uuid) sourceId: string,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      await this.calculators.removeSource(admin, versionId, sourceId, client),
    );
  }

  /** POST …/versions/:versionId/test-cases. */
  @Post('versions/:versionId/test-cases')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async addTestCase(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: AddTestCaseDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      await this.calculators.addTestCase(
        admin,
        versionId,
        { ...body, inputs: body.inputs as EvaluationInputs },
        client,
      ),
    );
  }

  /** DELETE …/versions/:versionId/test-cases/:testCaseId. */
  @Delete('versions/:versionId/test-cases/:testCaseId')
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async removeTestCase(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Param('testCaseId', uuid) testCaseId: string,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      await this.calculators.removeTestCase(admin, versionId, testCaseId, client),
    );
  }

  /** « Lancer les tests » (authors and reviewers). */
  @Post('versions/:versionId/test-run')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.read')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async runTests(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      (await this.calculators.runTests(admin, versionId, client)).version,
    );
  }

  /** « Soumettre à revue ». */
  @Post('versions/:versionId/submit')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.draft')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async submit(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(await this.calculators.submit(admin, versionId, client));
  }

  /** « Renvoyer à l'auteur ». */
  @Post('versions/:versionId/return')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.review')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async returnToDraft(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: CalculatorReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      await this.calculators.returnToDraft(admin, versionId, body.reason, client),
    );
  }

  /** « Approuver et publier » — reviewer ≠ author, primary source, all tests passing. */
  @Post('versions/:versionId/publish')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.review', 'calculators.publish')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async publish(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: PublishDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      await this.calculators.publish(admin, versionId, body.reviewNote, client),
    );
  }

  /** « Retirer ». */
  @Post('versions/:versionId/retire')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.retire')
  @ApiOkResponse({ type: AdminVersionDto })
  @errors
  async retire(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Body() body: CalculatorReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVersionDto> {
    return AdminVersionDto.from(
      await this.calculators.retire(admin, versionId, body.reason, client),
    );
  }

  /** DELETE …/versions/:versionId: deletes a draft. */
  @Delete('versions/:versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('calculators.draft')
  @ApiNoContentResponse()
  @errors
  async discard(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('versionId', uuid) versionId: string,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.calculators.discard(admin, versionId, client);
  }

  /** « Aperçu » with the backend engine; inputs are not stored. */
  @Post('versions/:versionId/preview')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('calculators.read')
  @ApiOkResponse({ type: EvaluationDto })
  @errors
  async preview(
    @Param('versionId', uuid) versionId: string,
    @Body() body: EvaluateDto,
  ): Promise<EvaluationDto> {
    return await this.calculators.preview(versionId, body.inputs as EvaluationInputs);
  }
}
