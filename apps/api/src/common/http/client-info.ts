import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Who is calling, for audit entries and rate limits. */
export interface ClientInfo {
  /** Client IP as resolved by Express (`trust proxy` = TRUST_PROXY_HOPS). */
  ip: string | null;
  userAgent: string | null;
}

/**
 * Reads the caller's IP and a truncated user agent from an Express request (for audit and rate
 * limits).
 */
export function clientInfoOf(request: Request): ClientInfo {
  const userAgent = request.get('user-agent');
  return {
    ip: request.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
  };
}

/** Injects the caller's IP and user agent. */
export const Client = createParamDecorator((_: unknown, context: ExecutionContext) =>
  clientInfoOf(context.switchToHttp().getRequest<Request>()),
);
