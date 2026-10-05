import { Body, Controller, Get, Param, ParseEnumPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ClinicalContentKind } from '../../generated/prisma/enums.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { ReviewPolicyDto, UpdateReviewPolicyDto } from './clinical-review.dto.js';
import { ClinicalReviewService } from './clinical-review.service.js';

/** « Double relecture »: the Super Admin's sign-off policy for clinical content (ADR-024). */
@ApiTags('admin-clinical-review')
@Controller(`${ADMIN_API_PREFIX}/clinical-review/policies`)
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class ClinicalReviewController {
  constructor(private readonly review: ClinicalReviewService) {}

  @Get()
  @RequireGrants('system.settings.write')
  @ApiOkResponse({ type: [ReviewPolicyDto] })
  async list(): Promise<ReviewPolicyDto[]> {
    return (await this.review.policies()).map((policy) => ReviewPolicyDto.from(policy));
  }

  @Put(':content')
  @RequireGrants('system.settings.write')
  @ApiParam({ name: 'content', enum: ClinicalContentKind, enumName: 'ClinicalContentKind' })
  @ApiOkResponse({ type: ReviewPolicyDto })
  async update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('content', new ParseEnumPipe(ClinicalContentKind)) content: ClinicalContentKind,
    @Body() body: UpdateReviewPolicyDto,
    @Client() client: ClientInfo,
  ): Promise<ReviewPolicyDto> {
    return ReviewPolicyDto.from(
      await this.review.setPolicy(admin, content, body.requiredSignOffs, body.reason, client),
    );
  }
}
