import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import { StorageService } from './storage.service.js';

/**
 * Serves the local driver's signed URLs (development and tests only; not part of the API
 * contract). With STORAGE_DRIVER=r2 every request here is a 404.
 */
@ApiExcludeController()
@Controller('v1/storage/local/objects')
export class LocalStorageController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageService,
  ) {}

  /** GET with a signed token: streams the object. */
  @Get()
  async read(@Query('token') token: string | undefined, @Res() response: Response): Promise<void> {
    const local = this.local();
    const grant = local.verifyGrant(token ?? '', 'GET');
    const object = await local.head(grant.bucket, grant.key);
    if (!object) throw new DomainError('NOT_FOUND', 'Object not found.');
    const bytes = await local.download(grant.bucket, grant.key);
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': object.contentType ?? 'application/octet-stream',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      })
      .send(Buffer.from(bytes));
  }

  /** PUT with a signed token: stores the body if type and size match the grant. */
  @Put()
  @HttpCode(HttpStatus.OK)
  async write(@Query('token') token: string | undefined, @Req() request: Request): Promise<void> {
    const local = this.local();
    const grant = local.verifyGrant(token ?? '', 'PUT');
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    if (
      !grant.contentType ||
      request.get('content-type') !== grant.contentType ||
      body.byteLength !== grant.contentLength
    ) {
      throw new DomainError('FORBIDDEN', 'Content type or length does not match the signed URL.');
    }
    await local.upload({
      bucket: grant.bucket,
      key: grant.key,
      body: new Uint8Array(body),
      contentType: grant.contentType,
    });
  }

  /** The local adapter, or 404 when R2 is configured. */
  private local(): LocalStorageAdapter {
    if (this.env.STORAGE_DRIVER !== 'local' || !(this.storage instanceof LocalStorageAdapter)) {
      throw new DomainError('NOT_FOUND', 'Not found.');
    }
    return this.storage;
  }
}
