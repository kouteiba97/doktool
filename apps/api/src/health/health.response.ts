import { ApiProperty } from '@nestjs/swagger';

/** Body of GET /v1/health. */
export class HealthResponse {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';

  @ApiProperty({ format: 'date-time', example: '2026-09-25T10:00:00.000Z' })
  checkedAt!: string;
}
