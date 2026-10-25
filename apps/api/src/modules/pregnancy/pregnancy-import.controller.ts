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
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DomainError } from '../../common/errors/domain-error.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import type { ColumnMapping, StatusMapping } from './import/rows.js';
import { MAX_FILE_BYTES } from './import/workbook.js';
import {
  CommitImportDto,
  CommitResultDto,
  DiscardImportDto,
  ImportListDto,
  ImportPreviewDto,
  ImportRowsQuery,
  PageQuery,
  SetImportMappingDto,
  UpdateImportRowDto,
} from './pregnancy-import.dto.js';
import { PregnancyImportService } from './pregnancy-import.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});
const uuid = new ParseUUIDPipe();

/**
 * Spreadsheet import into « Grossesse · Allaitement » (ADR-025). Every write needs
 * `pregnancy.draft`; nothing here publishes: the result is drafts a reviewer checks.
 */
@ApiTags('admin-pregnancy')
@Controller(`${ADMIN_API_PREFIX}/pregnancy/imports`)
@errors
export class PregnancyImportController {
  constructor(private readonly imports: PregnancyImportService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.draft')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: '.xlsx, 5 MB at most' },
      },
    },
  })
  @ApiOkResponse({ type: ImportPreviewDto })
  async upload(
    @CurrentAdmin() admin: AdminPrincipal,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Client() client: ClientInfo,
  ): Promise<ImportPreviewDto> {
    if (!file?.buffer)
      throw new DomainError('UPLOAD_INVALID', 'Attach an .xlsx file.', {
        fields: { file: ['Attach an .xlsx file.'] },
      });
    const id = await this.imports.upload(admin, file, client);
    return ImportPreviewDto.from(await this.imports.view(id, 'ALL', 50, 0));
  }

  @Get()
  @RequireGrants('pregnancy.read')
  @ApiOkResponse({ type: ImportListDto })
  async list(@Query() query: PageQuery): Promise<ImportListDto> {
    const { items, total } = await this.imports.list(query.limit ?? 50, query.offset ?? 0);
    return {
      total,
      items: items.map((batch) => ({
        id: batch.id,
        fileName: batch.fileName,
        fileSha256: batch.fileSha256,
        fileBytes: batch.fileBytes,
        sheetName: batch.sheetName,
        status: batch.status,
        revision: batch.revision,
        parserVersion: batch.parserVersion,
        uploadedBy: batch.uploadedBy,
        createdAt: batch.createdAt.toISOString(),
        committedBy: batch.committedBy,
        committedAt: batch.committedAt?.toISOString() ?? null,
        discardedAt: batch.discardedAt?.toISOString() ?? null,
        reason: batch.reason,
        result: (batch.summary as { result?: CommitResultDto } | null)?.result ?? null,
        rows: batch._count.rows,
      })),
    };
  }

  @Get(':id')
  @RequireGrants('pregnancy.read')
  @ApiOkResponse({ type: ImportPreviewDto })
  async view(
    @Param('id', uuid) id: string,
    @Query() query: ImportRowsQuery,
  ): Promise<ImportPreviewDto> {
    return ImportPreviewDto.from(
      await this.imports.view(id, query.filter ?? 'ALL', query.limit ?? 50, query.offset ?? 0),
    );
  }

  @Put(':id/mapping')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('pregnancy.draft')
  @ApiNoContentResponse()
  async mapping(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: SetImportMappingDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.imports.setMapping(
      admin,
      id,
      {
        revision: body.revision,
        ...(body.columns ? { columns: body.columns as ColumnMapping } : {}),
        ...(body.statuses ? { statuses: body.statuses as StatusMapping } : {}),
      },
      client,
    );
  }

  @Patch(':id/rows/:rowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('pregnancy.draft')
  @ApiNoContentResponse()
  async row(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Param('rowId', uuid) rowId: string,
    @Body() body: UpdateImportRowDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.imports.updateRow(admin, id, rowId, body, client);
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('pregnancy.draft')
  @ApiOkResponse({ type: CommitResultDto })
  async commit(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: CommitImportDto,
    @Client() client: ClientInfo,
  ): Promise<CommitResultDto> {
    return CommitResultDto.from(await this.imports.commit(admin, id, body, client));
  }

  @Post(':id/discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('pregnancy.draft')
  @ApiNoContentResponse()
  async discard(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', uuid) id: string,
    @Body() body: DiscardImportDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.imports.discard(admin, id, body.reason, client);
  }
}
