import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from './domain-error.js';

export class ErrorDetailsBody {
  @ApiPropertyOptional({ format: 'date-time' })
  retryAt?: string;

  @ApiPropertyOptional()
  attemptsRemaining?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  fields?: Record<string, string[]>;

  @ApiPropertyOptional({ description: 'FEATURE_LOCKED only.' })
  lockReason?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'FEATURE_LOCKED only.' })
  unlockPath?: string | null;
}

export class ErrorBody {
  @ApiProperty({ enum: Object.keys(ErrorCode) })
  code!: string;

  @ApiProperty({ description: 'For developers and logs; clients display their own translation.' })
  message!: string;

  @ApiProperty({ type: ErrorDetailsBody })
  details!: ErrorDetailsBody;
}

/** Shape of every error the API returns. */
export class ErrorResponse {
  @ApiProperty({ type: ErrorBody })
  error!: ErrorBody;
}
