import { Module, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../infrastructure/jobs/jobs.service.js';
import { AccessModule } from '../access/index.js';
import { AdminAuthModule } from '../admin-auth/index.js';
import { AuditModule } from '../audit/index.js';
import { StorageModule } from '../storage/index.js';
import { ReferenceDocumentsAdminService } from './reference-documents-admin.service.js';
import { ReferenceDocumentsService } from './reference-documents.service.js';
import { ReferenceLibraryAdminController } from './reference-library-admin.controller.js';
import { PROCESS_FILE_JOB, PROCESS_PENDING_SWEEP } from './reference-library.policy.js';
import { ReferenceLibraryController } from './reference-library.controller.js';
import { ReferenceProcessingService } from './reference-processing.service.js';

/**
 * Reference documents (ordonnances, certificates) and their immutable file versions (section 13).
 *
 * Owns: `reference_documents`, `reference_document_files`.
 * Other modules reach it only through ./index.ts.
 */
@Module({
  imports: [AccessModule, AdminAuthModule, AuditModule, StorageModule],
  controllers: [ReferenceLibraryController, ReferenceLibraryAdminController],
  providers: [
    ReferenceDocumentsService,
    ReferenceDocumentsAdminService,
    ReferenceProcessingService,
  ],
  exports: [ReferenceDocumentsService],
})
export class ReferenceLibraryModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly processing: ReferenceProcessingService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerWorker(PROCESS_FILE_JOB, async (data) => {
      if (typeof data.fileId === 'string') await this.processing.process(data.fileId);
    });
    this.jobs.register(PROCESS_PENDING_SWEEP, '* * * * *', () => this.processing.processPending());
  }
}
