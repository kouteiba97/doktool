// Public entry point of the admin-auth module (ADR-001). Other modules import from here only.
export { AdminAuthModule } from './admin-auth.module.js';
export { AdminAccountsService } from './admin-accounts.service.js';
export { type AdminPrincipal } from './admin-auth.service.js';
export {
  AdminBoundaryGuard,
  AdminSessionGuard,
  CurrentAdmin,
  RequireGrants,
} from './admin-guards.js';
export { GRANTS, PRESETS, type Grant, type Preset } from './grants.js';
