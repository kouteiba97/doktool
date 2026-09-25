import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ProfessionalType,
  VerificationStatus,
  VerificationType,
} from '../../generated/prisma/enums.js';
import type { UploadTicket } from '../storage/index.js';
import { ownerDetails, stepStates } from './verification-cases.js';
import type { QueueRecord, ReviewRecord } from './verification-review.service.js';
import type { CaseState, VerificationOverview } from './verification.service.js';
import {
  IDENTITY_DOCUMENT_KINDS,
  REJECTION_REASONS,
  type RejectionReason,
  STEP_TYPES,
  type StepType,
} from './verification.policy.js';

const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const iso = (date: Date | null | undefined): string | null => date?.toISOString() ?? null;

// ─────────────────────────────── requests ───────────────────────────────

export class StartVerificationDto {
  @ApiProperty({ enum: VerificationType, enumName: 'VerificationType' })
  @IsEnum(VerificationType)
  type!: VerificationType;

  @ApiPropertyOptional({
    enum: ['DOCTOR', 'RESIDENT'],
    description:
      'Professional status only: the role to prove. Defaults to the current role; a higher role is a role transition.',
  })
  @IsOptional()
  @IsIn(['DOCTOR', 'RESIDENT'])
  professionalType?: 'DOCTOR' | 'RESIDENT';
}

/** Complete details of the case (only the fields of its type are accepted). */
export class VerificationDetailsDto {
  @ApiPropertyOptional({ enum: IDENTITY_DOCUMENT_KINDS, description: 'Identity cases.' })
  @IsOptional()
  @IsIn(IDENTITY_DOCUMENT_KINDS)
  documentKind?: string;

  @ApiPropertyOptional({ description: 'Doctors: N° d’inscription à l’Ordre.', maxLength: 30 })
  @IsOptional()
  @trimmed
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$/)
  orderNumber?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Doctors and residents.' })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Residents.' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, description: 'Residents.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  residencyYear?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Students.' })
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 7, description: 'Students.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  academicYear?: number;
}

export class VerificationUploadRequestDto {
  @ApiProperty({ enum: STEP_TYPES, enumName: 'VerificationStepType' })
  @IsIn(STEP_TYPES)
  stepType!: StepType;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'application/pdf'] })
  @IsString()
  contentType!: string;

  @ApiProperty({ description: 'Exact size in bytes (at most 10 MB).' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ description: 'Lower-case hex SHA-256 of the file.' })
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}

export class AttachVerificationDocumentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  intentId!: string;

  @ApiProperty({ format: 'uuid', description: 'The id returned with the upload.' })
  @IsUUID()
  documentId!: string;

  @ApiProperty({ enum: STEP_TYPES, enumName: 'VerificationStepType' })
  @IsIn(STEP_TYPES)
  stepType!: StepType;
}

export class VerificationReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Recorded in the audit log.' })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ApproveVerificationDto extends VerificationReasonDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the verification expires (e.g. the end of validity of the document).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;
}

export class RejectVerificationDto extends VerificationReasonDto {
  @ApiProperty({ enum: REJECTION_REASONS, enumName: 'VerificationRejectionReason' })
  @IsIn(REJECTION_REASONS)
  reasonCode!: RejectionReason;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Shown to the person with the reason: which step to redo and why, in plain words.',
  })
  @IsOptional()
  @trimmed
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}

export class VerificationQueueQuery {
  @ApiPropertyOptional({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @ApiPropertyOptional({ enum: VerificationType, enumName: 'VerificationType' })
  @IsOptional()
  @IsEnum(VerificationType)
  type?: VerificationType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id of the last case of the previous page.' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

// ─────────────────────────────── responses ───────────────────────────────

export class VerificationUploadHeadersDto {
  @ApiProperty({ name: 'Content-Type' })
  'Content-Type'!: string;

  @ApiProperty({ name: 'Content-Length' })
  'Content-Length'!: string;
}

export class VerificationUploadTicketDto {
  @ApiProperty({ format: 'uuid' })
  intentId!: string;

  @ApiProperty({ enum: ['PUT'] })
  method!: 'PUT';

  @ApiProperty({ description: 'Signed URL, valid 15 minutes.' })
  url!: string;

  @ApiProperty({ type: VerificationUploadHeadersDto, description: 'Send exactly these headers.' })
  headers!: VerificationUploadHeadersDto;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class VerificationUploadStartDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ enum: STEP_TYPES, enumName: 'VerificationStepType' })
  stepType!: StepType;

  @ApiProperty({ type: VerificationUploadTicketDto })
  upload!: VerificationUploadTicketDto;

  static from(input: {
    documentId: string;
    stepType: StepType;
    upload: UploadTicket;
  }): VerificationUploadStartDto {
    return {
      documentId: input.documentId,
      stepType: input.stepType,
      upload: { ...input.upload, expiresAt: input.upload.expiresAt.toISOString() },
    };
  }
}

export class VerificationDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: STEP_TYPES, enumName: 'VerificationStepType' })
  stepType!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ format: 'date-time' })
  uploadedAt!: string;
}

export class VerificationStepDto {
  @ApiProperty({ enum: STEP_TYPES, enumName: 'VerificationStepType' })
  stepType!: StepType;

  @ApiProperty()
  required!: boolean;

  @ApiProperty()
  provided!: boolean;
}

export class VerificationDeclaredDetailsDto {
  @ApiPropertyOptional({ enum: ProfessionalType, enumName: 'ProfessionalType' })
  professionalType?: ProfessionalType;

  @ApiPropertyOptional({ enum: IDENTITY_DOCUMENT_KINDS })
  documentKind?: string;

  @ApiPropertyOptional({ description: 'Masked once the case is sent.' })
  orderNumber?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  specialtyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  institutionId?: string;

  @ApiPropertyOptional()
  residencyYear?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  universityId?: string;

  @ApiPropertyOptional()
  academicYear?: number;
}

export class VerificationRejectionDto {
  @ApiProperty({ enum: REJECTION_REASONS, enumName: 'VerificationRejectionReason' })
  reasonCode!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;
}

export class VerificationCaseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationType, enumName: 'VerificationType' })
  type!: VerificationType;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;

  @ApiProperty({ type: VerificationDeclaredDetailsDto })
  details!: VerificationDeclaredDetailsDto;

  @ApiProperty({ type: [VerificationStepDto] })
  steps!: VerificationStepDto[];

  @ApiProperty({ type: [VerificationDocumentDto] })
  documents!: VerificationDocumentDto[];

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  decidedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  expiresAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  appealedAt!: string | null;

  @ApiPropertyOptional({ type: VerificationRejectionDto, nullable: true })
  rejection!: VerificationRejectionDto | null;

  @ApiProperty({ description: 'An appeal is possible (after a second rejection).' })
  canAppeal!: boolean;

  static from(state: CaseState): VerificationCaseDto {
    const { record } = state;
    return {
      id: record.id,
      type: record.type,
      status: record.status,
      details: ownerDetails(record),
      steps: stepStates(record),
      documents: record.documents.map((document) => ({
        id: document.id,
        stepType: document.stepType,
        contentType: document.mimeType,
        sizeBytes: document.sizeBytes,
        uploadedAt: document.uploadedAt.toISOString(),
      })),
      submittedAt: iso(record.submittedAt),
      decidedAt: iso(record.decidedAt),
      expiresAt: iso(record.expiresAt),
      appealedAt: iso(record.appealedAt),
      rejection:
        record.status === 'REJECTED' && record.rejectionReasonCode
          ? { reasonCode: record.rejectionReasonCode, note: record.rejectionNote }
          : null,
      canAppeal: state.canAppeal,
    };
  }
}

export class VerificationTypeStateDto {
  @ApiProperty({ enum: VerificationType, enumName: 'VerificationType' })
  type!: VerificationType;

  @ApiProperty({ description: 'A new case of this type can be started now.' })
  canStart!: boolean;

  @ApiPropertyOptional({ type: VerificationCaseDto, nullable: true })
  latest!: VerificationCaseDto | null;
}

export class VerificationOverviewDto {
  @ApiPropertyOptional({ enum: ProfessionalType, enumName: 'ProfessionalType', nullable: true })
  professionalType!: ProfessionalType | null;

  @ApiProperty({ type: [VerificationTypeStateDto] })
  types!: VerificationTypeStateDto[];

  static from(overview: VerificationOverview): VerificationOverviewDto {
    return {
      professionalType: overview.professionalType,
      types: overview.types.map((state) => ({
        type: state.type,
        canStart: state.canStart,
        latest: state.latest ? VerificationCaseDto.from(state.latest) : null,
      })),
    };
  }
}

// ───────────────────────────── admin responses ─────────────────────────────

export class AdminNameDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class VerificationPersonNameDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;
}

export class AdminVerificationQueueItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationType, enumName: 'VerificationType' })
  type!: VerificationType;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;

  @ApiPropertyOptional({ enum: ProfessionalType, enumName: 'ProfessionalType', nullable: true })
  professionalType!: ProfessionalType | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  appealedAt!: string | null;

  @ApiPropertyOptional({ type: AdminNameDto, nullable: true })
  reviewer!: AdminNameDto | null;

  @ApiProperty({ type: VerificationPersonNameDto })
  user!: VerificationPersonNameDto;

  static from(record: QueueRecord): AdminVerificationQueueItemDto {
    const details = record.declaredDetails;
    const declared =
      details !== null && typeof details === 'object' && !Array.isArray(details) ? details : {};
    const professionalType =
      record.type === 'IDENTITY'
        ? null
        : record.type === 'STUDENT_STATUS'
          ? 'STUDENT'
          : declared.professionalType === 'RESIDENT'
            ? 'RESIDENT'
            : 'DOCTOR';
    return {
      id: record.id,
      type: record.type,
      status: record.status,
      professionalType,
      submittedAt: iso(record.submittedAt),
      appealedAt: iso(record.appealedAt),
      reviewer: record.reviewer,
      user: record.user,
    };
  }
}

export class AdminVerificationDocumentDto extends VerificationDocumentDto {
  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  purgeAfter!: string | null;
}

export class VerificationReferencesDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  specialty!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  institution!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  university!: string | null;
}

export class VerificationPersonProfileDto {
  @ApiProperty({ enum: ProfessionalType, enumName: 'ProfessionalType' })
  professionalType!: ProfessionalType;

  @ApiPropertyOptional({ type: Number, nullable: true })
  academicYear!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  residencyYear!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  orderNumberMasked!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  specialty!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  institution!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  university!: string | null;
}

export class VerificationPersonDto extends VerificationPersonNameDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  wilaya!: string | null;

  @ApiPropertyOptional({ type: VerificationPersonProfileDto, nullable: true })
  profile!: VerificationPersonProfileDto | null;
}

export class VerificationHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  decidedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectionReasonCode!: string | null;
}

export class AdminVerificationCaseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationType, enumName: 'VerificationType' })
  type!: VerificationType;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;

  @ApiProperty({
    type: VerificationDeclaredDetailsDto,
    description: 'As declared (Ordre number in full).',
  })
  details!: VerificationDeclaredDetailsDto;

  @ApiProperty({ type: VerificationReferencesDto })
  references!: VerificationReferencesDto;

  @ApiProperty({ type: [VerificationStepDto] })
  steps!: VerificationStepDto[];

  @ApiProperty({ type: [AdminVerificationDocumentDto] })
  documents!: AdminVerificationDocumentDto[];

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  decidedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  expiresAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', type: String, nullable: true })
  appealedAt!: string | null;

  @ApiPropertyOptional({ type: VerificationRejectionDto, nullable: true })
  rejection!: VerificationRejectionDto | null;

  @ApiPropertyOptional({ type: AdminNameDto, nullable: true })
  reviewer!: AdminNameDto | null;

  @ApiPropertyOptional({
    type: AdminNameDto,
    nullable: true,
    description: 'Reviewer whose rejection is appealed.',
  })
  rejectedBy!: AdminNameDto | null;

  @ApiProperty({ type: VerificationPersonDto })
  person!: VerificationPersonDto;

  @ApiProperty({
    type: [VerificationHistoryItemDto],
    description: 'Earlier cases of the same type.',
  })
  history!: VerificationHistoryItemDto[];

  static from(review: ReviewRecord): AdminVerificationCaseDto {
    const { record, person } = review;
    const profile = person.professionalProfile;
    return {
      id: record.id,
      type: record.type,
      status: record.status,
      details: record.declaredDetails as VerificationDeclaredDetailsDto,
      references: review.references,
      steps: stepStates(record),
      documents: record.documents.map((document) => ({
        id: document.id,
        stepType: document.stepType,
        contentType: document.mimeType,
        sizeBytes: document.sizeBytes,
        uploadedAt: document.uploadedAt.toISOString(),
        purgeAfter: iso(document.purgeAfter),
      })),
      submittedAt: iso(record.submittedAt),
      decidedAt: iso(record.decidedAt),
      expiresAt: iso(record.expiresAt),
      appealedAt: iso(record.appealedAt),
      rejection: record.rejectionReasonCode
        ? { reasonCode: record.rejectionReasonCode, note: record.rejectionNote }
        : null,
      reviewer: review.reviewer,
      rejectedBy: review.rejectedBy,
      person: {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
        status: person.status,
        createdAt: person.createdAt.toISOString(),
        wilaya: person.wilaya ? `${person.wilaya.code} · ${person.wilaya.name}` : null,
        profile: profile
          ? {
              professionalType: profile.professionalType,
              academicYear: profile.academicYear,
              residencyYear: profile.residencyYear,
              orderNumberMasked: profile.orderNumberMasked,
              specialty: profile.specialty?.nameFr ?? null,
              institution: profile.institution?.name ?? null,
              university: profile.university?.name ?? null,
            }
          : null,
      },
      history: review.history.map((item) => ({
        id: item.id,
        status: item.status,
        submittedAt: iso(item.submittedAt),
        decidedAt: iso(item.decidedAt),
        rejectionReasonCode: item.rejectionReasonCode,
      })),
    };
  }
}

export class VerificationDocumentUrlDto {
  @ApiProperty({
    description: 'Signed URL, valid 60 seconds. Render in the restricted viewer only.',
  })
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty({ description: 'Overlay this text on the document (reviewer identity and time).' })
  watermark!: string;
}
