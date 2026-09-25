import { Module } from '@nestjs/common';

/**
 * User authentication: sign-up, sign-in, OTP confirmation, access/refresh token rotation, device sessions.
 *
 * Owns no table.
 * Built in Phase 3 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class AuthModule {}
