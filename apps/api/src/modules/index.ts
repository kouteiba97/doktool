// Every domain module of the modular monolith (docs/adr/ADR-001).
import { AuthModule } from './auth/index.js';
import { AdminAuthModule } from './admin-auth/index.js';
import { UsersModule } from './users/index.js';
import { VerificationModule } from './verification/index.js';
import { AccessModule } from './access/index.js';
import { BillingModule } from './billing/index.js';
import { FinanceModule } from './finance/index.js';
import { ReferenceLibraryModule } from './reference-library/index.js';
import { CalculatorsModule } from './calculators/index.js';
import { SearchModule } from './search/index.js';
import { ActivityModule } from './activity/index.js';
import { OfflineModule } from './offline/index.js';
import { NotificationsModule } from './notifications/index.js';
import { AnalyticsModule } from './analytics/index.js';
import { AuditModule } from './audit/index.js';
import { DemoModule } from './demo/index.js';
import { StorageModule } from './storage/index.js';
import { AdminModule } from './admin/index.js';

export const DOMAIN_MODULES = [
  AuthModule,
  AdminAuthModule,
  UsersModule,
  VerificationModule,
  AccessModule,
  BillingModule,
  FinanceModule,
  ReferenceLibraryModule,
  CalculatorsModule,
  SearchModule,
  ActivityModule,
  OfflineModule,
  NotificationsModule,
  AnalyticsModule,
  AuditModule,
  DemoModule,
  StorageModule,
  AdminModule,
] as const;
