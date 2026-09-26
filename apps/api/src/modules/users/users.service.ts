import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import {
  type Language,
  Prisma,
  type ProfessionalType,
  type ThemePreference,
  type WeightUnit,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { Identifier } from './identifier.js';

/** Sign-in lockout (ADR-009): 5 wrong passwords lock the account for 15 minutes. */
export const SIGN_IN_MAX_FAILURES = 5;
export const SIGN_IN_LOCK_MINUTES = 15;
/** Accounts never confirmed are deleted after this many days. */
export const UNCONFIRMED_ACCOUNT_TTL_DAYS = 7;

export interface PendingAccountInput {
  identifier: Identifier;
  passwordHash: string;
  firstName: string;
  lastName: string;
  wilayaCode: number;
  termsVersion: string;
  language: Language;
}

export interface SignInCandidate {
  id: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  identifierConfirmed: boolean;
  lockedUntil: Date | null;
}

export interface AccessFacts {
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  professionalType: ProfessionalType | null;
  academicYear: number | null;
}

export interface ProfessionalProfileInput {
  professionalType: ProfessionalType;
  specialtyId?: string;
  institutionId?: string;
  universityId?: string;
  academicYear?: number;
  residencyYear?: number;
}

export interface PreferencesInput {
  language?: Language;
  theme?: ThemePreference;
  weightUnitDefault?: WeightUnit | null;
}

const identifierWhere = (identifier: Identifier): Prisma.UserWhereUniqueInput =>
  identifier.channel === 'EMAIL' ? { email: identifier.value } : { phone: identifier.value };

const ME_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  bio: true,
  avatarStorageKey: true,
  email: true,
  phone: true,
  emailConfirmedAt: true,
  phoneConfirmedAt: true,
  status: true,
  createdAt: true,
  wilaya: { select: { code: true, name: true } },
  professionalProfile: {
    select: {
      professionalType: true,
      specialtyId: true,
      institutionId: true,
      universityId: true,
      academicYear: true,
      residencyYear: true,
    },
  },
  preference: { select: { language: true, theme: true, weightUnitDefault: true } },
} satisfies Prisma.UserSelect;

export type MeRecord = Prisma.UserGetPayload<{ select: typeof ME_SELECT }>;

/** Owner of `users`, `professional_profiles`, `user_preferences` and the reference pickers. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the account, or restarts an unconfirmed one with the new details.
   * A confirmed identifier is refused with ACCOUNT_EXISTS (design: « Ce compte existe déjà »).
   */
  async createOrRestartPendingAccount(input: PendingAccountInput): Promise<{ userId: string }> {
    await this.assertWilaya(input.wilayaCode);
    const now = new Date();
    const details = {
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      wilayaCode: input.wilayaCode,
      termsVersion: input.termsVersion,
      termsAcceptedAt: now,
      failedSignInCount: 0,
      lockedUntil: null,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: identifierWhere(input.identifier),
          select: { id: true, emailConfirmedAt: true, phoneConfirmedAt: true },
        });
        if (existing) {
          const confirmed =
            input.identifier.channel === 'EMAIL'
              ? existing.emailConfirmedAt
              : existing.phoneConfirmedAt;
          if (confirmed)
            throw new DomainError('ACCOUNT_EXISTS', 'An account already uses this identifier.');
          await tx.user.update({
            where: { id: existing.id },
            data: { ...details, preference: { update: { language: input.language } } },
          });
          return { userId: existing.id };
        }
        const created = await tx.user.create({
          data: {
            ...details,
            ...(input.identifier.channel === 'EMAIL'
              ? { email: input.identifier.value }
              : { phone: input.identifier.value }),
            preference: { create: { language: input.language } },
          },
          select: { id: true },
        });
        return { userId: created.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('ACCOUNT_EXISTS', 'An account already uses this identifier.');
      }
      throw error;
    }
  }

  async markIdentifierConfirmed(userId: string, channel: Identifier['channel']): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data:
        channel === 'EMAIL' ? { emailConfirmedAt: new Date() } : { phoneConfirmedAt: new Date() },
    });
  }

  async findSignInCandidate(identifier: Identifier): Promise<SignInCandidate | null> {
    const user = await this.prisma.user.findUnique({
      where: identifierWhere(identifier),
      select: {
        id: true,
        passwordHash: true,
        status: true,
        emailConfirmedAt: true,
        phoneConfirmedAt: true,
        lockedUntil: true,
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      passwordHash: user.passwordHash,
      status: user.status,
      identifierConfirmed:
        (identifier.channel === 'EMAIL' ? user.emailConfirmedAt : user.phoneConfirmedAt) !== null,
      lockedUntil: user.lockedUntil,
    };
  }

  /** What the access policy needs to know about an account (ADR-010). */
  async getAccessFacts(userId: string): Promise<AccessFacts | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        professionalProfile: { select: { professionalType: true, academicYear: true } },
      },
    });
    if (!user) return null;
    return {
      status: user.status,
      professionalType: user.professionalProfile?.professionalType ?? null,
      academicYear: user.professionalProfile?.academicYear ?? null,
    };
  }

  /** True when the account exists and is ACTIVE (checked on every token refresh). */
  async isActive(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    return user?.status === 'ACTIVE';
  }

  /** User id of a confirmed, active account for this identifier (password reset). */
  async findConfirmedActiveUserId(identifier: Identifier): Promise<string | null> {
    const candidate = await this.findSignInCandidate(identifier);
    return candidate && candidate.identifierConfirmed && candidate.status === 'ACTIVE'
      ? candidate.id
      : null;
  }

  /** Counts one wrong password atomically; returns the lock end when this failure locks the account. */
  async registerFailedSignIn(userId: string): Promise<Date | null> {
    const [row] = await this.prisma.$queryRaw<{ locked_until: Date | null; locked_now: boolean }[]>`
      UPDATE users SET
        failed_sign_in_count = CASE WHEN failed_sign_in_count + 1 >= ${SIGN_IN_MAX_FAILURES} THEN 0
                                    ELSE failed_sign_in_count + 1 END,
        locked_until = CASE WHEN failed_sign_in_count + 1 >= ${SIGN_IN_MAX_FAILURES}
                            THEN now() + make_interval(mins => ${SIGN_IN_LOCK_MINUTES})
                            ELSE locked_until END
      WHERE id = ${userId}::uuid
      RETURNING locked_until, (failed_sign_in_count = 0) AS locked_now`;
    return row?.locked_now ? row.locked_until : null;
  }

  async clearSignInFailures(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedSignInCount: 0, lockedUntil: null, lastSeenAt: new Date() },
    });
  }

  /** Sets a new password and lifts any lockout (password reset). */
  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedSignInCount: 0, lockedUntil: null },
    });
  }

  async getMe(userId: string): Promise<MeRecord> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: ME_SELECT });
    if (!user || user.status === 'DELETED')
      throw new DomainError('UNAUTHENTICATED', 'Account not found.');
    return user;
  }

  /** « Modifier »: name and bio (null clears the bio). Verification keeps the names it checked. */
  async updateProfile(
    userId: string,
    input: { firstName?: string; lastName?: string; bio?: string | null },
  ): Promise<MeRecord> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
        ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
      },
    });
    return this.getMe(userId);
  }

  async updatePreferences(userId: string, input: PreferencesInput): Promise<MeRecord> {
    await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    return this.getMe(userId);
  }

  /**
   * Records who the person is (onboarding « Qui êtes-vous ? »). Set once; changing type later is a
   * re-verification (Phase 9).
   */
  async setProfessionalProfile(userId: string, input: ProfessionalProfileInput): Promise<MeRecord> {
    const fields: Record<string, string[]> = {};
    if (input.academicYear !== undefined && input.professionalType !== 'STUDENT') {
      fields.academicYear = ['Only medical students have an academic year.'];
    }
    if (input.residencyYear !== undefined && input.professionalType !== 'RESIDENT') {
      fields.residencyYear = ['Only residents have a residency year.'];
    }
    await this.assertReferencesExist(input, fields);
    if (Object.keys(fields).length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid professional profile.', { fields });
    }
    try {
      await this.prisma.professionalProfile.create({ data: { userId, ...input } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('PROFILE_ALREADY_SET', 'The professional profile is already set.');
      }
      throw error;
    }
    return this.getMe(userId);
  }

  /** Current professional type, or null before « Qui êtes-vous ? ». */
  async professionalTypeOf(userId: string): Promise<ProfessionalType | null> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { professionalType: true },
    });
    return profile?.professionalType ?? null;
  }

  /** Checks that the pickers referenced by declared details exist (VALIDATION_FAILED otherwise). */
  async assertProfessionalReferences(input: ProfessionalProfileInput): Promise<void> {
    const fields: Record<string, string[]> = {};
    await this.assertReferencesExist(input, fields);
    if (Object.keys(fields).length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid professional details.', { fields });
    }
  }

  /** Display names of picker references, for a reviewer reading declared details. */
  async describeReferences(ids: {
    specialtyId?: string;
    institutionId?: string;
    universityId?: string;
  }): Promise<{ specialty: string | null; institution: string | null; university: string | null }> {
    const specialty = ids.specialtyId
      ? await this.prisma.specialty.findUnique({
          where: { id: ids.specialtyId },
          select: { nameFr: true },
        })
      : null;
    const institution = ids.institutionId
      ? await this.prisma.institution.findUnique({
          where: { id: ids.institutionId },
          select: { name: true },
        })
      : null;
    const university = ids.universityId
      ? await this.prisma.university.findUnique({
          where: { id: ids.universityId },
          select: { name: true },
        })
      : null;
    return {
      specialty: specialty?.nameFr ?? null,
      institution: institution?.name ?? null,
      university: university?.name ?? null,
    };
  }

  /**
   * Applies a verified status case to the profile: the proved type and its details replace the
   * previous ones (a role transition keeps favorites, activity and preferences). The profile keeps
   * only a masked Ordre number.
   */
  async applyVerifiedStatus(
    userId: string,
    input: ProfessionalProfileInput & { orderNumberMasked?: string },
  ): Promise<void> {
    const data = {
      professionalType: input.professionalType,
      specialtyId: input.specialtyId ?? null,
      institutionId: input.institutionId ?? null,
      universityId: input.universityId ?? null,
      academicYear: input.professionalType === 'STUDENT' ? (input.academicYear ?? null) : null,
      residencyYear: input.professionalType === 'RESIDENT' ? (input.residencyYear ?? null) : null,
      orderNumberMasked: input.orderNumberMasked ?? null,
    };
    await this.prisma.professionalProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  /** First and last names by user id, for admin lists. */
  async names(ids: string[]): Promise<Map<string, { firstName: string; lastName: string }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      rows.map((row) => [row.id, { firstName: row.firstName, lastName: row.lastName }]),
    );
  }

  /** Specialty (FR/EN) and university names by id, for the verification queue columns. */
  async affiliationNames(ids: { specialtyIds: string[]; universityIds: string[] }): Promise<{
    specialties: Map<string, { fr: string; en: string }>;
    universities: Map<string, string>;
  }> {
    const specialtyIds = [...new Set(ids.specialtyIds)];
    const universityIds = [...new Set(ids.universityIds)];
    const [specialties, universities] = await Promise.all([
      specialtyIds.length === 0
        ? []
        : this.prisma.specialty.findMany({
            where: { id: { in: specialtyIds } },
            select: { id: true, nameFr: true, nameEn: true },
          }),
      universityIds.length === 0
        ? []
        : this.prisma.university.findMany({
            where: { id: { in: universityIds } },
            select: { id: true, name: true },
          }),
    ]);
    return {
      specialties: new Map(specialties.map((row) => [row.id, { fr: row.nameFr, en: row.nameEn }])),
      universities: new Map(universities.map((row) => [row.id, row.name])),
    };
  }

  /** What a verification reviewer sees about the person (never the password or tokens). */
  async reviewSummary(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        wilaya: { select: { code: true, name: true } },
        professionalProfile: {
          select: {
            professionalType: true,
            academicYear: true,
            residencyYear: true,
            orderNumberMasked: true,
            specialty: { select: { id: true, nameFr: true, nameEn: true } },
            institution: { select: { id: true, name: true } },
            university: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  // ─────────────── reference pickers (specialties, institutions, universities) ───────────────

  listSpecialties() {
    return this.prisma.specialty.findMany({
      orderBy: { nameFr: 'asc' },
      select: { id: true, code: true, nameFr: true, nameEn: true },
    });
  }

  listInstitutions(wilayaCode?: number) {
    return this.prisma.institution.findMany({
      where: wilayaCode ? { wilayaCode } : {},
      orderBy: { name: 'asc' },
      select: { id: true, name: true, wilayaCode: true },
    });
  }

  listUniversities() {
    return this.prisma.university.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, wilayaCode: true },
    });
  }

  async createSpecialty(input: { code: string; nameFr: string; nameEn: string }) {
    try {
      return await this.prisma.specialty.create({
        data: input,
        select: { id: true, code: true, nameFr: true, nameEn: true },
      });
    } catch (error) {
      throw this.conflict(error, 'A specialty already uses this code.');
    }
  }

  async createInstitution(input: { name: string; wilayaCode: number }) {
    await this.assertWilaya(input.wilayaCode);
    try {
      return await this.prisma.institution.create({
        data: input,
        select: { id: true, name: true, wilayaCode: true },
      });
    } catch (error) {
      throw this.conflict(error, 'This institution already exists in this wilaya.');
    }
  }

  async createUniversity(input: { name: string; wilayaCode: number }) {
    await this.assertWilaya(input.wilayaCode);
    try {
      return await this.prisma.university.create({
        data: input,
        select: { id: true, name: true, wilayaCode: true },
      });
    } catch (error) {
      throw this.conflict(error, 'This university already exists in this wilaya.');
    }
  }

  private conflict(error: unknown, message: string): unknown {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      ? new DomainError('VERSION_CONFLICT', message)
      : error;
  }

  listWilayas(): Promise<{ code: number; name: string }[]> {
    return this.prisma.wilaya.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    });
  }

  /** Deletes accounts whose identifier was never confirmed (hourly maintenance job). */
  async purgeUnconfirmedAccounts(): Promise<number> {
    const cutoff = new Date(Date.now() - UNCONFIRMED_ACCOUNT_TTL_DAYS * 24 * 3600 * 1000);
    const { count } = await this.prisma.user.deleteMany({
      where: { emailConfirmedAt: null, phoneConfirmedAt: null, createdAt: { lt: cutoff } },
    });
    return count;
  }

  private async assertWilaya(code: number): Promise<void> {
    const exists = await this.prisma.wilaya.count({ where: { code } });
    if (!exists) {
      throw new DomainError('VALIDATION_FAILED', 'Unknown wilaya.', {
        fields: { wilayaCode: ['Unknown wilaya.'] },
      });
    }
  }

  private async assertReferencesExist(
    input: ProfessionalProfileInput,
    fields: Record<string, string[]>,
  ): Promise<void> {
    const checks: [keyof ProfessionalProfileInput, Promise<number>][] = [];
    if (input.specialtyId) {
      checks.push([
        'specialtyId',
        this.prisma.specialty.count({ where: { id: input.specialtyId } }),
      ]);
    }
    if (input.institutionId) {
      checks.push([
        'institutionId',
        this.prisma.institution.count({ where: { id: input.institutionId } }),
      ]);
    }
    if (input.universityId) {
      checks.push([
        'universityId',
        this.prisma.university.count({ where: { id: input.universityId } }),
      ]);
    }
    for (const [field, count] of checks) {
      if ((await count) === 0) fields[field] = ['Unknown reference.'];
    }
  }
}
