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
import type { IdentifiedRequest } from '../http/request-id.js';
import { DomainError } from './domain-error.js';
import type { ErrorResponse } from './error-response.js';

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/** First HTTP status that means the server failed, rather than the request. */
const SERVER_ERROR = 500;

/** Renders every failure as `{ error: { code, message, details } }`. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  /** Called by Nest for any exception thrown while handling a request; writes the JSON error. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const [status, body] = this.toBody(exception);
    if (status >= SERVER_ERROR && !(exception instanceof DomainError)) {
      // Where it happened, with the id the client received: enough to find a reported failure.
      // The path only — never the query string or the body, which can carry personal data.
      const request = http.getRequest<IdentifiedRequest>();
      this.logger.error(
        `${request.method} ${request.path} → ${status} [request ${request.requestId ?? 'unknown'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
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
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { error: { code: 'INTERNAL', message: 'Unexpected error.', details: {} } },
    ];
  }
}
