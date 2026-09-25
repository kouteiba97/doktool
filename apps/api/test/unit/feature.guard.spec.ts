import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { DomainError } from '../../src/common/errors/domain-error.js';
import { evaluateAccess } from '../../src/modules/access/access-policy.js';
import type { AccessService } from '../../src/modules/access/access.service.js';
import type { FeatureKey } from '../../src/modules/access/access.types.js';
import { FeatureGuard } from '../../src/modules/access/require-feature.js';

const demoProfile = evaluateAccess({ accessContext: 'DEMO', demoContext: 'DOCTOR' });
const guard = new FeatureGuard(
  { profileFor: () => Promise.resolve(demoProfile) } as unknown as AccessService,
  new Reflector(),
);

function contextFor(feature: FeatureKey | undefined, withViewer = true): ExecutionContext {
  const handler = () => undefined;
  if (feature) Reflect.defineMetadata('doktool:required-feature', feature, handler);
  const request = withViewer
    ? { viewer: { accessContext: 'DEMO', demoSessionId: 'd', demoContext: 'DOCTOR' } }
    : {};
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('FeatureGuard', () => {
  it('lets an AVAILABLE feature through', async () => {
    await expect(guard.canActivate(contextFor('search'))).resolves.toBe(true);
  });

  it('refuses a LOCKED feature with its reason and unlock path', async () => {
    const error = (await guard
      .canActivate(contextFor('offline.sync'))
      .catch((e: unknown) => e)) as DomainError;
    expect(error.code).toBe('FEATURE_LOCKED');
    expect(error.details).toEqual({ lockReason: 'DEMO_LIMIT', unlockPath: 'auth.sign-up' });
  });

  it('requires a viewer when a feature is declared', async () => {
    const error = (await guard
      .canActivate(contextFor('search', false))
      .catch((e: unknown) => e)) as DomainError;
    expect(error.code).toBe('UNAUTHENTICATED');
  });
});
