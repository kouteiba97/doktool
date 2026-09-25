import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { type DomainError } from '../../src/common/errors/domain-error.js';
import type {
  AdminAuthService,
  AdminPrincipal,
} from '../../src/modules/admin-auth/admin-auth.service.js';
import {
  AdminBoundaryGuard,
  AdminSessionGuard,
} from '../../src/modules/admin-auth/admin-guards.js';
import type { Grant } from '../../src/modules/admin-auth/grants.js';
import { testEnv, TEST_ADMIN_ORIGIN } from '../support/env.js';

function contextFor(
  request: Record<string, unknown>,
  requiredGrants: Grant[] = [],
): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata('doktool:required-grants', requiredGrants, handler);
  const headers = (request.headers ?? {}) as Record<string, string>;
  const fullRequest = {
    method: 'GET',
    cookies: {},
    ...request,
    get: (name: string) => headers[name],
  };
  return {
    switchToHttp: () => ({ getRequest: () => fullRequest }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const principal = (grants: Grant[]): AdminPrincipal => ({
  adminId: 'a',
  sessionId: 's',
  email: 'x@doktool.dz',
  fullName: 'X',
  grants,
});

const sessionGuard = (grants: Grant[]) =>
  new AdminSessionGuard(
    { resolveSession: () => Promise.resolve(principal(grants)) } as unknown as AdminAuthService,
    new Reflector(),
  );

const codeOf = async (promise: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof promise === 'function' ? promise() : promise);
    return 'OK';
  } catch (error) {
    return (error as DomainError).code;
  }
};

describe('AdminBoundaryGuard', () => {
  const guard = new AdminBoundaryGuard(testEnv());

  it('refuses any bearer token on admin routes', async () => {
    const context = contextFor({ headers: { authorization: 'Bearer user-token' } });
    expect(await codeOf(() => guard.canActivate(context))).toBe('UNAUTHENTICATED');
  });

  it('requires the Admin Web origin for state-changing requests only', async () => {
    expect(await codeOf(() => guard.canActivate(contextFor({ method: 'POST' })))).toBe(
      'ORIGIN_NOT_ALLOWED',
    );
    expect(
      await codeOf(() =>
        guard.canActivate(
          contextFor({ method: 'POST', headers: { origin: 'https://evil.example' } }),
        ),
      ),
    ).toBe('ORIGIN_NOT_ALLOWED');
    expect(
      await codeOf(() =>
        guard.canActivate(contextFor({ method: 'POST', headers: { origin: TEST_ADMIN_ORIGIN } })),
      ),
    ).toBe('OK');
    expect(await codeOf(() => guard.canActivate(contextFor({ method: 'GET' })))).toBe('OK');
  });
});

describe('AdminSessionGuard', () => {
  it('requires the session cookie', async () => {
    expect(await codeOf(sessionGuard([]).canActivate(contextFor({})))).toBe('UNAUTHENTICATED');
  });

  it('checks every required grant', async () => {
    const withCookie = (grants: Grant[]) =>
      contextFor({ cookies: { '__Host-doktool_admin': 'token' } }, grants);
    expect(
      await codeOf(sessionGuard(['library.read']).canActivate(withCookie(['library.write']))),
    ).toBe('FORBIDDEN');
    expect(
      await codeOf(
        sessionGuard(['library.read', 'library.write']).canActivate(withCookie(['library.write'])),
      ),
    ).toBe('OK');
  });
});
