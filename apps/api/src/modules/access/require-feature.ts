import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { DomainError } from '../../common/errors/domain-error.js';
import { type Viewer, ViewerAuthGuard } from '../../infrastructure/security/viewer-auth.guard.js';
import { featureOf } from './access-policy.js';
import { AccessService } from './access.service.js';
import type { FeatureKey } from './access.types.js';

const REQUIRED_FEATURE = 'doktool:required-feature';

/** Re-evaluates the policy on every request and refuses a LOCKED feature (L34: every endpoint re-checks). */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly access: AccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<FeatureKey | undefined>(REQUIRED_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;
    const request = context.switchToHttp().getRequest<Request & { viewer?: Viewer }>();
    if (!request.viewer) throw new DomainError('UNAUTHENTICATED', 'Viewer required.');
    const feature = featureOf(await this.access.profileFor(request.viewer), key);
    if (feature.state === 'LOCKED') {
      throw new DomainError('FEATURE_LOCKED', `Feature ${key} is locked.`, {
        lockReason: feature.lockReason ?? undefined,
        unlockPath: feature.unlockPath,
      });
    }
    return true;
  }
}

/** Guards a route with a user or demo token and the given feature being AVAILABLE. */
export function RequireFeature(key: FeatureKey) {
  return applyDecorators(
    SetMetadata(REQUIRED_FEATURE, key),
    UseGuards(ViewerAuthGuard, FeatureGuard),
    ApiBearerAuth('user'),
    ApiBearerAuth('demo'),
  );
}
