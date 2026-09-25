// Public entry point of the access module (ADR-001). Other modules import from here only.
export { AccessModule } from './access.module.js';
export { AccessService } from './access.service.js';
export { FeatureGuard, RequireFeature } from './require-feature.js';
export { ItemAccessDto, AccessProfileDto } from './access.dto.js';
export { decideItem, evaluateAccess } from './access-policy.js';
export type {
  AccessibleItem,
  AccessProfile,
  ContentType,
  FeatureKey,
  ItemAccess,
  LockReason,
} from './access.types.js';
