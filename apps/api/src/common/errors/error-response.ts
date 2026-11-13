import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from './domain-error.js';

/** Optional details attached to an error (OpenAPI shape of ErrorDetails). */
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

  @ApiPropertyOptional({
    enum: ['SIGNED_IN_ELSEWHERE'],
    description: 'SESSION_INVALID only: the account was opened on another device.',
  })
  sessionEnd?: 'SIGNED_IN_ELSEWHERE';
}

/** The `error` object: a stable code clients translate, a developer message and details. */
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
