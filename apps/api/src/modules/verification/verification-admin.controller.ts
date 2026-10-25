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
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import {
  AdminVerificationCaseDto,
  AdminVerificationQueueItemDto,
  ApproveVerificationDto,
  RejectVerificationDto,
  VerificationDocumentUrlDto,
  VerificationQueueQuery,
  VerificationReasonDto,
} from './verification.dto.js';
import { VerificationReviewService } from './verification-review.service.js';

const id = new ParseUUIDPipe();

/** Admin Web « Vérifications »: queue, review drawer, restricted viewer, decisions (section 07). */
@ApiTags('admin-verification')
@Controller(`${ADMIN_API_PREFIX}/verification`)
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class VerificationAdminController {
  constructor(private readonly review: VerificationReviewService) {}

  /** GET /admin/v1/verification/cases: the review queue. */
  @Get('cases')
  @RequireGrants('verification.queue.read')
  @ApiOkResponse({ type: [AdminVerificationQueueItemDto] })
  async queue(@Query() query: VerificationQueueQuery): Promise<AdminVerificationQueueItemDto[]> {
    return (await this.review.queue(query)).map((item) => AdminVerificationQueueItemDto.from(item));
  }

  /** One case in the review drawer. */
  @Get('cases/:id')
  @RequireGrants('verification.queue.read')
  @ApiOkResponse({ type: AdminVerificationCaseDto })
  async detail(@Param('id', id) caseId: string): Promise<AdminVerificationCaseDto> {
    return AdminVerificationCaseDto.from(await this.review.detail(caseId));
  }

  /** Takes the case for review. */
  @Post('cases/:id/claim')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.review')
  @ApiOkResponse({ type: AdminVerificationCaseDto })
  async claim(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) caseId: string,
    @Client() client: ClientInfo,
  ): Promise<AdminVerificationCaseDto> {
    return AdminVerificationCaseDto.from(await this.review.claim(admin, caseId, client));
  }

  /** Gives the case back to the queue. */
  @Post('cases/:id/release')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.review')
  @ApiOkResponse({ type: AdminVerificationCaseDto })
  async release(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) caseId: string,
    @Body() body: VerificationReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVerificationCaseDto> {
    return AdminVerificationCaseDto.from(
      await this.review.release(admin, caseId, body.reason, client),
    );
  }

  /** Approves the case. */
  @Post('cases/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.review')
  @ApiOkResponse({ type: AdminVerificationCaseDto })
  async approve(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) caseId: string,
    @Body() body: ApproveVerificationDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVerificationCaseDto> {
    return AdminVerificationCaseDto.from(
      await this.review.approve(
        admin,
        caseId,
        { reason: body.reason, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined },
        client,
      ),
    );
  }

  /** Rejects the case with a reason. */
  @Post('cases/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.review')
  @ApiOkResponse({ type: AdminVerificationCaseDto })
  async reject(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) caseId: string,
    @Body() body: RejectVerificationDto,
    @Client() client: ClientInfo,
  ): Promise<AdminVerificationCaseDto> {
    return AdminVerificationCaseDto.from(
      await this.review.reject(
        admin,
        caseId,
        { reason: body.reason, reasonCode: body.reasonCode, note: body.note },
        client,
      ),
    );
  }

  /** Restricted viewer: 60-second URL plus watermark text; every view is audited. */
  @Post('documents/:id/view')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('verification.review', 'verification.documents.view')
  @ApiOkResponse({ type: VerificationDocumentUrlDto })
  async viewDocument(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) documentId: string,
    @Client() client: ClientInfo,
  ): Promise<VerificationDocumentUrlDto> {
    const view = await this.review.viewDocument(admin, documentId, client);
    return { ...view, expiresAt: view.expiresAt.toISOString() };
  }
}
