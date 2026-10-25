import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain-error.js';
import type { ErrorResponse } from './error-response.js';

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/** Renders every failure as `{ error: { code, message, details } }`. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  /** Called by Nest for any exception thrown while handling a request; writes the JSON error. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toBody(exception);
    response.status(status).json(body);
  }

  /**
   * Maps an exception to [HTTP status, body]: DomainError as is, validation errors as
   * VALIDATION_FAILED, other HTTP errors by status, anything else as a logged 500.
   */
  private toBody(exception: unknown): [number, ErrorResponse] {
    if (exception instanceof DomainError) {
      return [
        exception.status,
        { error: { code: exception.code, message: exception.message, details: exception.details } },
      ];
    }
    if (exception instanceof BadRequestException) {
      const payload = exception.getResponse();
      const messages =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? ([] as string[]).concat((payload as { message: string | string[] }).message)
          : [exception.message];
      return [
        HttpStatus.BAD_REQUEST,
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The request is invalid.',
            details: { fields: { request: messages } },
          },
        },
      ];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return [
        status,
        {
          error: {
            code: STATUS_CODES[status] ?? 'HTTP_ERROR',
            message: exception.message,
            details: {},
          },
        },
      ];
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { error: { code: 'INTERNAL', message: 'Unexpected error.', details: {} } },
    ];
  }
}
