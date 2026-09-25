import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCookieAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { DomainError } from '../../common/errors/domain-error.js';
import { ENV, type Env } from '../../config/env.js';
import { ADMIN_SESSION_COOKIE } from './admin-auth.policy.js';
import { type AdminPrincipal, AdminAuthService } from './admin-auth.service.js';
import type { Grant } from './grants.js';

type AdminRequest = Request & { admin?: AdminPrincipal };

/** cookie-parser types `request.cookies` as `any`; read it as the string map it is. */
const cookieOf = (request: Request, name: string): string | undefined =>
  (request.cookies as Record<string, string | undefined> | undefined)?.[name];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUIRED_GRANTS = 'doktool:required-grants';

/**
 * Trust boundary of every admin route (ADR-009): user bearer tokens are refused outright, and a
 * state-changing request must come from the Admin Web origin (CSRF defence on top of SameSite).
 */
@Injectable()
export class AdminBoundaryGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (request.get('authorization')) {
      throw new DomainError('UNAUTHENTICATED', 'The admin API does not accept bearer tokens.');
    }
    if (!SAFE_METHODS.has(request.method) && request.get('origin') !== this.env.ADMIN_WEB_ORIGIN) {
      throw new DomainError('ORIGIN_NOT_ALLOWED', 'Admin requests must come from Admin Web.');
    }
    return true;
  }
}

/** Requires a live admin session cookie and every grant listed by {@link RequireGrants}. */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = cookieOf(request, ADMIN_SESSION_COOKIE);
    if (!token) throw new DomainError('UNAUTHENTICATED', 'Admin session required.');
    const principal = await this.auth.resolveSession(token);
    const required =
      this.reflector.getAllAndOverride<Grant[] | undefined>(REQUIRED_GRANTS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const missing = required.filter((grant) => !principal.grants.includes(grant));
    if (missing.length > 0) {
      throw new DomainError('FORBIDDEN', `Missing grant(s): ${missing.join(', ')}.`);
    }
    request.admin = principal;
    return true;
  }
}

/** Guards a route with an admin session holding all of `grants`. */
export function RequireGrants(...grants: Grant[]) {
  return applyDecorators(
    SetMetadata(REQUIRED_GRANTS, grants),
    UseGuards(AdminBoundaryGuard, AdminSessionGuard),
    ApiCookieAuth('admin'),
  );
}

export const CurrentAdmin = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const admin = context.switchToHttp().getRequest<AdminRequest>().admin;
  if (!admin)
    throw new DomainError('UNAUTHENTICATED', 'Route is not guarded by AdminSessionGuard.');
  return admin;
});
