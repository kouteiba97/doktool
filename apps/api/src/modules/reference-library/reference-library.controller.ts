import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { USER_API_PREFIX } from '../../http/api-prefix.js';
import {
  CurrentViewer,
  type Viewer,
  ViewerAuthGuard,
} from '../../infrastructure/security/viewer-auth.guard.js';
import { FileUrlDto, ReferenceItemDto, ReferenceListQuery } from './reference-library.dto.js';
import { ReferenceDocumentsService } from './reference-documents.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/**
 * Ordonnances and Certificates for the app (section 13). Locked models stay listed with their
 * reason; only an AVAILABLE model yields a PDF URL. Works with user and demo tokens.
 */
@ApiTags('reference-library')
@Controller(`${USER_API_PREFIX}/reference-documents`)
@UseGuards(ViewerAuthGuard)
@ApiBearerAuth('user')
@ApiBearerAuth('demo')
export class ReferenceLibraryController {
  constructor(private readonly documents: ReferenceDocumentsService) {}

  /** A–Z list of one type (favorites-first ordering is applied by the app with its favorites). */
  @Get()
  @ApiOkResponse({ type: [ReferenceItemDto] })
  @errors
  async list(
    @CurrentViewer() viewer: Viewer,
    @Query() query: ReferenceListQuery,
  ): Promise<ReferenceItemDto[]> {
    return (await this.documents.list(viewer, query.type, query.q)).map((item) =>
      ReferenceItemDto.from(item),
    );
  }

  /** One model; CONTENT_UNAVAILABLE (410) once disabled or archived. */
  @Get(':id')
  @ApiOkResponse({ type: ReferenceItemDto })
  @errors
  async get(
    @CurrentViewer() viewer: Viewer,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReferenceItemDto> {
    return ReferenceItemDto.from(await this.documents.get(viewer, id));
  }

  /** Signed 10-minute URL to the PDF; FEATURE_LOCKED with the reason when the model is locked. */
  @Get(':id/file-url')
  @ApiOkResponse({ type: FileUrlDto })
  @errors
  async fileUrl(
    @CurrentViewer() viewer: Viewer,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FileUrlDto> {
    const file = await this.documents.fileUrl(viewer, id);
    return {
      url: file.url,
      expiresAt: file.expiresAt.toISOString(),
      fileVersion: file.fileVersion,
      sha256: file.sha256,
    };
  }
}
