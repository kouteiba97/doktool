import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const OPENAPI_TITLE = 'DokTool API';
export const OPENAPI_VERSION = '1.0.0';

/** Builds the OpenAPI document that packages/api-contract publishes to the Dart and TS clients. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(OPENAPI_TITLE)
    .setDescription(
      'Backend of DokTool V1. User API under /v1 (Flutter app), admin API under /admin/v1 (Admin Web). ' +
        'The backend decides every rule; clients render its decisions. ' +
        'Every error is `{ error: { code, message, details } }`; clients translate `code`.',
    )
    .setVersion(OPENAPI_VERSION)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'user')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Demo token (audience doktool-demo)',
      },
      'demo',
    )
    .addCookieAuth('__Host-doktool_admin', { type: 'apiKey', in: 'cookie' }, 'admin')
    .build();
  return SwaggerModule.createDocument(app, config);
}
