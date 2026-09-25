import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainError } from '../../common/errors/domain-error.js';
import { type UserPrincipal, UserTokens } from './user-tokens.js';

type AuthenticatedRequest = Request & { user?: UserPrincipal };

/** Requires a valid user access token (`Authorization: Bearer …`). Admin cookies are ignored. */
@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly tokens: UserTokens) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.get('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header);
    if (!match?.[1]) throw new DomainError('UNAUTHENTICATED', 'Missing bearer token.');
    request.user = await this.tokens.verify(match[1]);
    return true;
  }
}

/** The principal set by {@link UserAuthGuard}. */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new DomainError('UNAUTHENTICATED', 'Route is not guarded by UserAuthGuard.');
  return user;
});
