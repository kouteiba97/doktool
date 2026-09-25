import { Module } from '@nestjs/common';

/**
 * Accounts, professional profiles, preferences and the reference pickers (wilayas, specialties, institutions, universities).
 *
 * Owns: `users`, `professional_profiles`, `user_preferences`, `wilayas`, `specialties`, `institutions`, `universities`.
 * Built in Phase 3 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class UsersModule {}
