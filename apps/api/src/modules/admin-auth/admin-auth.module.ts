import { Module } from '@nestjs/common';

/**
 * Admin authentication: separate issuer, cookie sessions, mandatory TOTP, admin accounts and grants.
 *
 * Owns: `admin_accounts`, `admin_grants`.
 * Built in Phase 3 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class AdminAuthModule {}
