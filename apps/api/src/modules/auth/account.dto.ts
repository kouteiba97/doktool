import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AccountRecoveryRequest } from '../../generated/prisma/client.js';
import { Language, MessageChannel, RecoveryStatus } from '../../generated/prisma/enums.js';
import type { UploadTicket } from '../storage/index.js';
import type { AccountContacts } from '../users/index.js';
import { OtpChallengeDto } from './auth.dto.js';
import {
  OTP_DIGITS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RECOVERY_REJECTION_REASONS,
  type RecoveryRejectionReason,
} from './auth.policy.js';
import type { RecoverySlot } from './account-recovery.service.js';

const OTP_CODE = new RegExp(`^\\d{${OTP_DIGITS}}$`);
const RECOVERY_SLOTS = ['IDENTITY_DOCUMENT', 'SELFIE'] as const;
const trimmed = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

class PasswordConfirmation {
  @ApiProperty({ description: 'The current password: every account change asks for it.' })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

// ─────────────────────────────── contacts and password ───────────────────────────────

export class ContactRequestDto extends PasswordConfirmation {
  @ApiProperty({
    description: 'The e-mail or mobile number to add; it replaces the current one of its kind.',
  })
  @IsString()
  @MaxLength(254)
  identifier!: string;

  @ApiPropertyOptional({ enum: Language, enumName: 'Language', default: 'FR' })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

export class ContactConfirmDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Matches(OTP_CODE)
  code!: string;
}

export class ContactRemoveDto extends PasswordConfirmation {
  @ApiProperty({ enum: MessageChannel, enumName: 'MessageChannel' })
  @IsEnum(MessageChannel)
  channel!: MessageChannel;
}

export class PasswordChangeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}

export class PendingRecoveryDto {
  @ApiProperty({ enum: ['SUBMITTED', 'APPROVED'] }) status!: 'SUBMITTED' | 'APPROVED';
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'APPROVED: when it replaces the contacts unless cancelled.',
  })
  effectiveAt!: string | null;
}

export class AccountContactsDto {
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() emailConfirmed!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'E.164' }) phone!: string | null;
  @ApiProperty() phoneConfirmed!: boolean;
  @ApiProperty({
    description:
      'Both contacts are confirmed: losing one of them never locks the person out (ADR-023).',
  })
  recoverable!: boolean;
  @ApiProperty({
    type: PendingRecoveryDto,
    nullable: true,
    description: 'Someone asked to recover this account; « Ce n’est pas moi » cancels it.',
  })
  pendingRecovery!: PendingRecoveryDto | null;

  static from(
    contacts: AccountContacts,
    pending: { status: string; effectiveAt: Date | null } | null,
  ): AccountContactsDto {
    return {
      email: contacts.email,
      emailConfirmed: contacts.emailConfirmed,
      phone: contacts.phone,
      phoneConfirmed: contacts.phoneConfirmed,
      recoverable: contacts.emailConfirmed && contacts.phoneConfirmed,
      pendingRecovery: pending
        ? {
            status: pending.status === 'APPROVED' ? 'APPROVED' : 'SUBMITTED',
            effectiveAt: pending.effectiveAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}

// ─────────────────────────────── assisted recovery ───────────────────────────────

export class RecoveryStartDto {
  @ApiProperty({ description: 'The e-mail or phone of the account, now out of reach.' })
  @IsString()
  @MaxLength(254)
  lostIdentifier!: string;

  @ApiProperty({ description: 'A new e-mail or phone the person receives messages on.' })
  @IsString()
  @MaxLength(254)
  newIdentifier!: string;

  @ApiProperty({ maxLength: 80 })
  @trimmed
  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ maxLength: 80 })
  @trimmed
  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional({ enum: Language, enumName: 'Language', default: 'FR' })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

export class RecoveryStartedDto {
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ type: OtpChallengeDto, description: 'The code sent to the new contact.' })
  challenge!: OtpChallengeDto;
}

export class RecoveryConfirmDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Matches(OTP_CODE)
  code!: string;
}

export class RecoveryTokenDto {
  @ApiProperty({
    description: 'Kept in memory by the app until the photos are sent; never stored.',
  })
  recoveryToken!: string;
  @ApiProperty({ format: 'date-time', description: 'The photos must be sent before this.' })
  expiresAt!: string;
}

class RecoveryTokenField {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  recoveryToken!: string;
}

export class RecoveryUploadRequestDto extends RecoveryTokenField {
  @ApiProperty({ enum: RECOVERY_SLOTS, enumName: 'RecoveryPhotoSlot' })
  @IsIn(RECOVERY_SLOTS)
  slot!: RecoverySlot;

  @ApiProperty({ description: 'image/jpeg or image/png.', example: 'image/jpeg' })
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

export class RecoveryUploadHeadersDto {
  @ApiProperty({ name: 'Content-Type' })
  'Content-Type'!: string;

  @ApiProperty({ name: 'Content-Length' })
  'Content-Length'!: string;
}

export class RecoveryUploadTicketDto {
  @ApiProperty({ format: 'uuid' }) intentId!: string;
  @ApiProperty({ enum: ['PUT'] }) method!: 'PUT';
  @ApiProperty({ description: 'Signed URL, valid 15 minutes.' }) url!: string;
  @ApiProperty({ type: RecoveryUploadHeadersDto, description: 'Send exactly these headers.' })
  headers!: RecoveryUploadHeadersDto;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;

  static from(ticket: UploadTicket): RecoveryUploadTicketDto {
    return { ...ticket, expiresAt: ticket.expiresAt.toISOString() };
  }
}

export class RecoveryAttachDto extends RecoveryTokenField {
  @ApiProperty({ enum: RECOVERY_SLOTS, enumName: 'RecoveryPhotoSlot' })
  @IsIn(RECOVERY_SLOTS)
  slot!: RecoverySlot;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  intentId!: string;
}

export class RecoverySubmitDto extends RecoveryTokenField {}

export class RecoverySubmittedDto {
  @ApiProperty({ description: 'The team answers on the new contact within this many hours.' })
  answerWithinHours!: number;
}

// ─────────────────────────────── Admin Web ───────────────────────────────

export class RecoveryListQuery {
  @ApiPropertyOptional({ enum: RecoveryStatus, enumName: 'RecoveryStatus' })
  @IsOptional()
  @IsEnum(RecoveryStatus)
  status?: RecoveryStatus;
}

export class AdminRecoveryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: RecoveryStatus, enumName: 'RecoveryStatus' }) status!: RecoveryStatus;
  @ApiProperty({ description: 'The lost contact the person named.' }) claimedIdentifier!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: MessageChannel, enumName: 'MessageChannel' }) newChannel!: MessageChannel;
  @ApiProperty() newDestination!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) userId!: string | null;
  @ApiProperty() hasIdentityPhoto!: boolean;
  @ApiProperty() hasSelfie!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) submittedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decidedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) rejectionReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) decisionNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) effectiveAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) appliedAt!: string | null;

  static from(request: AccountRecoveryRequest): AdminRecoveryDto {
    const iso = (date: Date | null) => date?.toISOString() ?? null;
    return {
      id: request.id,
      status: request.status,
      claimedIdentifier: request.claimedIdentifier,
      firstName: request.firstName,
      lastName: request.lastName,
      newChannel: request.newChannel,
      newDestination: request.newDestination,
      userId: request.userId,
      hasIdentityPhoto: request.identityDocumentKey !== null,
      hasSelfie: request.selfieKey !== null,
      submittedAt: iso(request.submittedAt),
      decidedAt: iso(request.decidedAt),
      rejectionReason: request.rejectionReason,
      decisionNote: request.decisionNote,
      effectiveAt: iso(request.effectiveAt),
      appliedAt: iso(request.appliedAt),
    };
  }
}

export class RecoveryAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() wilaya!: string;
  @ApiProperty({ type: String, nullable: true }) professionalType!: string | null;
  @ApiProperty({ description: 'Identity verification status on file (NOT_STARTED, VERIFIED…).' })
  identityStatus!: string;
  @ApiProperty() professionalStatus!: string;
}

export class AdminRecoveryDetailDto {
  @ApiProperty({ type: AdminRecoveryDto }) request!: AdminRecoveryDto;
  @ApiProperty({
    type: RecoveryAccountDto,
    nullable: true,
    description: 'The account the lost contact belongs to; null when none does.',
  })
  account!: RecoveryAccountDto | null;
}

export class RecoveryPhotoViewDto {
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty({ description: 'Overlay it on the photo (who viewed it, when).' })
  watermark!: string;
}

export class RecoveryApproveDto {
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'What was compared and found.' })
  @trimmed
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;
}

export class RecoveryRejectDto extends RecoveryApproveDto {
  @ApiProperty({ enum: RECOVERY_REJECTION_REASONS, enumName: 'RecoveryRejectionReason' })
  @IsIn(RECOVERY_REJECTION_REASONS)
  reason!: RecoveryRejectionReason;
}
