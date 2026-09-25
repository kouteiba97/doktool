import { Module } from '@nestjs/common';

/**
 * In-app notifications rendered from catalogue keys.
 *
 * Owns: `notifications`.
 * Built in Phase 13 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class NotificationsModule {}
