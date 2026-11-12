import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AdminChallengeKind } from '../../generated/prisma/enums.js';
import { ADMIN_PASSWORD_MAX_LENGTH, ADMIN_PASSWORD_MIN_LENGTH } from './admin-auth.policy.js';
import type { AdminPrincipal, AdminSignInStep } from './admin-auth.service.js';
import { GRANTS } from './grants.js';

/** Body of the password step. */
export class AdminSignInDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

/** Body of POST /admin/v1/auth/password: the signed-in admin changes their own password. */
export class AdminChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(ADMIN_PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: ADMIN_PASSWORD_MIN_LENGTH, maxLength: ADMIN_PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN_LENGTH)
  @MaxLength(ADMIN_PASSWORD_MAX_LENGTH)
  newPassword!: string;
}

/** Body of the TOTP step. */
export class AdminTotpDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  challengeToken!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code!: string;
}

/** First sign-in only: the secret to add to an authenticator app. */
export class TotpEnrollmentDto {
  @ApiProperty({ description: 'Base32 secret, for manual entry in an authenticator app.' })
  secretBase32!: string;

  @ApiProperty({ description: 'otpauth:// URI, to render as a QR code.' })
  otpauthUri!: string;
}

/** Answer of the password step. */
export class AdminSignInStepDto {
  @ApiProperty({ enum: AdminChallengeKind, enumName: 'AdminChallengeKind' })
  next!: AdminChallengeKind;

  @ApiProperty({ description: 'Send back with the TOTP code; valid 5 minutes.' })
  challengeToken!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: TotpEnrollmentDto, nullable: true })
  enrollment!: TotpEnrollmentDto | null;

  static from(step: AdminSignInStep): AdminSignInStepDto {
    return {
      next: step.next,
      challengeToken: step.challengeToken,
      expiresAt: step.expiresAt.toISOString(),
      enrollment: step.enrollment,
    };
  }
}

/** The signed-in admin, as Admin Web receives it. */
export class AdminMeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: GRANTS, isArray: true, description: 'Effective (non-expired) grants.' })
  grants!: string[];

  static from(principal: AdminPrincipal): AdminMeDto {
    return {
      id: principal.adminId,
      email: principal.email,
      fullName: principal.fullName,
      grants: principal.grants,
    };
  }
}
