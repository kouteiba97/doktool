import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { type Express, raw } from 'express';
import helmet from 'helmet';
import { ErrorFilter } from './common/errors/error.filter.js';
import type { Env } from './config/env.js';
import { LOCAL_OBJECTS_PATH } from './modules/storage/index.js';
import { buildOpenApiDocument } from './openapi/document.js';

/** HTTP settings shared by the server entry point and the end-to-end tests. */
export function configureApp(app: INestApplication, env: Env): void {
  const http = app.getHttpAdapter().getInstance() as Express;
  http.disable('x-powered-by');
  // Client IPs (rate limits, audit) come from X-Forwarded-For only behind known proxies.
  http.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(cookieParser());
  if (env.STORAGE_DRIVER === 'local') {
    // Local signed uploads carry raw file bytes (ADR-011); R2 uploads never reach the API.
    app.use(LOCAL_OBJECTS_PATH, raw({ type: () => true, limit: '21mb' }));
  }
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();

  // Interactive API docs for developers only; the published contract is packages/api-contract.
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app));
  }
}
