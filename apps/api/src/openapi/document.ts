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
        'The backend decides every rule; clients render its decisions.',
    )
    .setVersion(OPENAPI_VERSION)
    .build();
  return SwaggerModule.createDocument(app, config);
}
