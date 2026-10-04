import { Module } from '@nestjs/common';
import { AccessModule } from '../access/index.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { PregnancyAdminController } from './pregnancy-admin.controller.js';
import { PregnancyAdminService } from './pregnancy-admin.service.js';
import { PregnancyController } from './pregnancy.controller.js';
import { PregnancyService } from './pregnancy.service.js';

/**
 * « Grossesse · Allaitement » (ADR-019): substances, versioned pregnancy and lactation profiles
 * reviewed by someone other than their author, the clinical sources registry and user reports.
 * Not a drug database: no posology, products or interactions.
 *
 * Owns: `substances`, `substance_profile_versions`, `clinical_sources`, `profile_version_sources`,
 * `content_reports`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AccessModule, AdminAuthModule, AuditModule],
  controllers: [PregnancyController, PregnancyAdminController],
  providers: [PregnancyService, PregnancyAdminService],
  exports: [PregnancyService, PregnancyAdminService],
})
export class PregnancyModule {}
