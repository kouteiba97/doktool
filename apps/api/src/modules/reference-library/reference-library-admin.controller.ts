import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import {
  AdminListQuery,
  AdminReferenceDocumentDto,
  CreateReferenceDocumentDto,
  ReasonDto,
  ReplaceFileDto,
  RequestReplacementDto,
  RequestUploadDto,
  SignedUrlDto,
  UpdateReferenceDocumentDto,
  UploadStartDto,
  UploadTicketDto,
} from './reference-library.dto.js';
import {
  type LifecycleAction,
  ReferenceDocumentsAdminService,
} from './reference-documents-admin.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});
const id = new ParseUUIDPipe();

/** Reference Library management for Admin Web (section 13, grants `library.*`). */
@ApiTags('admin-reference-library')
@Controller(`${ADMIN_API_PREFIX}/reference-documents`)
export class ReferenceLibraryAdminController {
  constructor(private readonly documents: ReferenceDocumentsAdminService) {}

  /** GET /admin/v1/reference-documents. */
  @Get()
  @RequireGrants('library.read')
  @ApiOkResponse({ type: [AdminReferenceDocumentDto] })
  @errors
  async list(@Query() query: AdminListQuery): Promise<AdminReferenceDocumentDto[]> {
    return (await this.documents.list(query)).map((record) =>
      AdminReferenceDocumentDto.from(record),
    );
  }

  /** GET /admin/v1/reference-documents/:id. */
  @Get(':id')
  @RequireGrants('library.read')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @errors
  async detail(@Param('id', id) documentId: string): Promise<AdminReferenceDocumentDto> {
    return AdminReferenceDocumentDto.from(await this.documents.detail(documentId));
  }

  /** « Voir le PDF » for any stored version. */
  @Get(':id/files/:fileId/url')
  @RequireGrants('library.read')
  @ApiOkResponse({ type: SignedUrlDto })
  @errors
  async previewUrl(
    @Param('id', id) documentId: string,
    @Param('fileId', id) fileId: string,
  ): Promise<SignedUrlDto> {
    const preview = await this.documents.previewUrl(documentId, fileId);
    return { url: preview.url, expiresAt: preview.expiresAt.toISOString() };
  }

  /** Step 1 of « Ajouter un modèle »: a signed upload for the PDF (≤ 20 MB). */
  @Post('uploads')
  @RequireGrants('library.write')
  @ApiOkResponse({ type: UploadStartDto })
  @HttpCode(HttpStatus.OK)
  @errors
  async requestUpload(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: RequestUploadDto,
  ): Promise<UploadStartDto> {
    const start = await this.documents.requestUpload(admin, body);
    return { ...start, upload: UploadTicketDto.from(start.upload) };
  }

  /** Step 2: creates the model once the PDF is uploaded; it shows « Traitement… » until processed. */
  @Post()
  @RequireGrants('library.write')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @HttpCode(HttpStatus.OK)
  @errors
  async create(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: CreateReferenceDocumentDto,
    @Client() client: ClientInfo,
  ): Promise<AdminReferenceDocumentDto> {
    return AdminReferenceDocumentDto.from(await this.documents.create(admin, body, client));
  }

  /** Display metadata only (titles, demo sample); never the PDF. */
  @Patch(':id')
  @RequireGrants('library.write')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @errors
  async update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) documentId: string,
    @Body() body: UpdateReferenceDocumentDto,
    @Client() client: ClientInfo,
  ): Promise<AdminReferenceDocumentDto> {
    return AdminReferenceDocumentDto.from(
      await this.documents.update(admin, documentId, body, client),
    );
  }

  /** « Remplacer le PDF », step 1: a signed upload for the next version. */
  @Post(':id/replacement-uploads')
  @RequireGrants('library.write')
  @ApiOkResponse({ type: UploadStartDto })
  @HttpCode(HttpStatus.OK)
  @errors
  async requestReplacement(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) documentId: string,
    @Body() body: RequestReplacementDto,
  ): Promise<UploadStartDto> {
    const start = await this.documents.requestReplacement(admin, documentId, body);
    return { ...start, upload: UploadTicketDto.from(start.upload) };
  }

  /** « Remplacer le PDF », step 2: same id, new version, previous files kept. */
  @Post(':id/files')
  @RequireGrants('library.write')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @HttpCode(HttpStatus.OK)
  @errors
  async replace(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) documentId: string,
    @Body() body: ReplaceFileDto,
    @Client() client: ClientInfo,
  ): Promise<AdminReferenceDocumentDto> {
    return AdminReferenceDocumentDto.from(
      await this.documents.replace(admin, documentId, body, client),
    );
  }

  /** Enables a disabled model. */
  @Post(':id/enable')
  @RequireGrants('library.disable')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @HttpCode(HttpStatus.OK)
  @errors
  enable(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('id', id) d: string,
    @Body() b: ReasonDto,
    @Client() c: ClientInfo,
  ) {
    return this.lifecycle(a, d, 'enable', b, c);
  }

  /** Hides a model from users. */
  @Post(':id/disable')
  @RequireGrants('library.disable')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @HttpCode(HttpStatus.OK)
  @errors
  disable(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('id', id) d: string,
    @Body() b: ReasonDto,
    @Client() c: ClientInfo,
  ) {
    return this.lifecycle(a, d, 'disable', b, c);
  }

  /** Replaces hard delete: gone for users and from default admin views; files kept. */
  @Post(':id/archive')
  @RequireGrants('library.write')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @HttpCode(HttpStatus.OK)
  @errors
  archive(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('id', id) d: string,
    @Body() b: ReasonDto,
    @Client() c: ClientInfo,
  ) {
    return this.lifecycle(a, d, 'archive', b, c);
  }

  /** Brings an archived model back as disabled. */
  @Post(':id/restore')
  @RequireGrants('library.write')
  @ApiOkResponse({ type: AdminReferenceDocumentDto })
  @HttpCode(HttpStatus.OK)
  @errors
  restore(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('id', id) d: string,
    @Body() b: ReasonDto,
    @Client() c: ClientInfo,
  ) {
    return this.lifecycle(a, d, 'restore', b, c);
  }

  /** Shared handler of enable, disable, archive and restore. */
  private async lifecycle(
    admin: AdminPrincipal,
    documentId: string,
    action: LifecycleAction,
    body: ReasonDto,
    client: ClientInfo,
  ): Promise<AdminReferenceDocumentDto> {
    return AdminReferenceDocumentDto.from(
      await this.documents.changeStatus(admin, documentId, action, body.reason, client),
    );
  }
}
