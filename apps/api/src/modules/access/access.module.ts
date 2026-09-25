import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/index.js';
import { UsersModule } from '../users/index.js';
import { VerificationModule } from '../verification/index.js';
import { AccessController } from './access.controller.js';
import { AccessService } from './access.service.js';
import { FeatureGuard } from './require-feature.js';

/**
 * The entitlement policy engine — the only place access is decided (ADR-004, ADR-006, ADR-010).
 * Owns no table: AccessProfile is derived on every request.
 *
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [UsersModule, VerificationModule, BillingModule],
  controllers: [AccessController],
  providers: [AccessService, FeatureGuard],
  exports: [AccessService, FeatureGuard],
})
export class AccessModule {}
