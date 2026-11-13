import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { USER_API_PREFIX } from '../http/api-prefix.js';
import { HealthResponse } from './health.response.js';

/** Public health endpoint: no token needed. */
@ApiTags('health')
@Controller(`${USER_API_PREFIX}/health`)
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness and database readiness, for load balancers and uptime checks. */
  @Get()
  @ApiOkResponse({ type: HealthResponse, description: 'The API and its database are up.' })
  @ApiServiceUnavailableResponse({
    type: HealthResponse,
    description: 'The database is unreachable.',
  })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const databaseUp = await this.prisma.isReachable();
    response.status(databaseUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      checkedAt: new Date().toISOString(),
    };
  }
}
