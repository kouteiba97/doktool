import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { type Express, type NextFunction, type Request, type Response, raw } from 'express';
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
    // Admin Web uploads PDFs and shows verification documents from its own origin, as it does
    // against R2 (whose bucket CORS allows ADMIN_WEB_ORIGIN, docs/operations/r2-cors.md).
    app.use(LOCAL_OBJECTS_PATH, (request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (request.get('origin') === env.ADMIN_WEB_ORIGIN) {
        response.setHeader('Access-Control-Allow-Origin', env.ADMIN_WEB_ORIGIN);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Methods', 'GET, PUT');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.setHeader('Access-Control-Max-Age', '600');
      }
      if (request.method === 'OPTIONS') {
        response.status(204).end();
        return;
      }
      next();
    });
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
