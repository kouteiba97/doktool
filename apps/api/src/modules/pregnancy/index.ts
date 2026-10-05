// Public entry point of the pregnancy module (ADR-001). Other modules import from here only.
export { PregnancyModule } from './pregnancy.module.js';
export {
  PregnancyService,
  type SubstanceItem,
  type SubstanceProfile,
} from './pregnancy.service.js';
export { SubstanceProfileDto } from './pregnancy.dto.js';
export { PregnancyAdminService } from './pregnancy-admin.service.js';
