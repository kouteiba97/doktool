import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { decodeProtectedHeader, decodeJwt } from 'jose';
import type { Request } from 'express';
import { DomainError } from '../../common/errors/domain-error.js';
import { DEMO_AUDIENCE, type DemoPrincipal, DemoTokens } from './demo-tokens.js';
import { type UserPrincipal, UserTokens } from './user-tokens.js';

/** Whoever is looking at content: a signed-in user, or a demo session (ADR-010). */
export type Viewer =
  | ({ accessContext: 'AUTHENTICATED' } & UserPrincipal)
  | ({ accessContext: 'DEMO' } & DemoPrincipal);

/** An Express request after ViewerAuthGuard ran. */
type ViewerRequest = Request & { viewer?: Viewer };

/**
 * For read routes open to both user and demo tokens. Write routes use UserAuthGuard, which
 * refuses demo tokens.
 */
@Injectable()
export class ViewerAuthGuard implements CanActivate {
  constructor(
    private readonly userTokens: UserTokens,
    private readonly demoTokens: DemoTokens,
  ) {}

  /** Accepts either a user token or a demo token and stores the resulting viewer on the request. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ViewerRequest>();
    const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(request.get('authorization') ?? '');
    const token = match?.[1];
    if (!token) throw new DomainError('UNAUTHENTICATED', 'Missing bearer token.');
    request.viewer = isDemoToken(token)
      ? { accessContext: 'DEMO', ...(await this.demoTokens.verify(token)) }
      : { accessContext: 'AUTHENTICATED', ...(await this.userTokens.verify(token)) };
    return true;
  }
}

/** Routes by the unverified audience claim only; the chosen verifier then checks everything. */
function isDemoToken(token: string): boolean {
  try {
    decodeProtectedHeader(token);
    const { aud } = decodeJwt(token);
    return aud === DEMO_AUDIENCE || (Array.isArray(aud) && aud.includes(DEMO_AUDIENCE));
  } catch {
    return false;
  }
}

/** Route parameter decorator returning the viewer set by ViewerAuthGuard. */
export const CurrentViewer = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const viewer = context.switchToHttp().getRequest<ViewerRequest>().viewer;
  if (!viewer) throw new DomainError('UNAUTHENTICATED', 'Route is not guarded by ViewerAuthGuard.');
  return viewer;
});
