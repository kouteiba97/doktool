import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import type { Env } from './config/env.js';
import { buildOpenApiDocument } from './openapi/document.js';

/** HTTP settings shared by the server entry point and the end-to-end tests. */
export function configureApp(app: INestApplication, env: Env): void {
  const http = app.getHttpAdapter().getInstance() as Express;
  http.disable('x-powered-by');
  app.enableShutdownHooks();

  // Interactive API docs for developers only; the published contract is packages/api-contract.
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app));
  }
}
