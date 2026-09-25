import { Module } from '@nestjs/common';
import { AccessModule } from '../access/index.js';
import { ReferenceLibraryModule } from '../reference-library/index.js';
import { OfflineController } from './offline.controller.js';
import { OfflineService } from './offline.service.js';

/**
 * Offline manifests of the content each account is entitled to (Lock L44).
 *
 * Owns no table.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AccessModule, ReferenceLibraryModule],
  controllers: [OfflineController],
  providers: [OfflineService],
})
export class OfflineModule {}
