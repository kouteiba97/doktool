import { Module } from '@nestjs/common';
import { AccessModule } from '../access/index.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { CalculatorsAdminController } from './calculators-admin.controller.js';
import { CalculatorsAdminService } from './calculators-admin.service.js';
import { CalculatorsController } from './calculators.controller.js';
import { CalculatorsService } from './calculators.service.js';

/**
 * Calculator definitions, versions, sources, test cases and the authoritative TypeScript engine
 * (ADR-003, ADR-012). No formula lives in this module's code: definitions are reviewed data.
 *
 * Owns: `calculators`, `calculator_versions`, `calculator_sources`, `calculator_test_cases`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AccessModule, AdminAuthModule, AuditModule],
  controllers: [CalculatorsController, CalculatorsAdminController],
  providers: [CalculatorsService, CalculatorsAdminService],
  exports: [CalculatorsService],
})
export class CalculatorsModule {}
