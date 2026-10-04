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
import { ProfilePhotoService } from './profile-photo.service.js';

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

/** The contacts of an account (ADR-023): only confirmed ones are used to reach the person. */
export interface AccountContacts {
  email: string | null;
  emailConfirmed: boolean;
  phone: string | null;
  phoneConfirmed: boolean;
  language: Language;
  firstName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}

export interface SignInCandidate {
  id: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  identifierConfirmed: boolean;
  lockedUntil: Date | null;
}

/** What Admin Web shows of a person: identity and profile, never the password or tokens. */
const ADMIN_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  lastSeenAt: true,
  emailConfirmedAt: true,
  phoneConfirmedAt: true,
  wilaya: { select: { code: true, name: true } },
  preference: { select: { language: true } },
  professionalProfile: {
    select: {
      professionalType: true,
      academicYear: true,
      residencyYear: true,
      orderNumberMasked: true,
      specialty: { select: { code: true, nameFr: true, nameEn: true } },
      institution: { select: { name: true } },
      university: { select: { name: true } },
    },
  },
} as const satisfies Prisma.UserSelect;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: ProfilePhotoService,
  ) {}

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
  async contactsOf(userId: string): Promise<AccountContacts | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        emailConfirmedAt: true,
        phone: true,
        phoneConfirmedAt: true,
        firstName: true,
        status: true,
        preference: { select: { language: true } },
      },
    });
    if (!user) return null;
    return {
      email: user.email,
      emailConfirmed: user.emailConfirmedAt !== null,
      phone: user.phone,
      phoneConfirmed: user.phoneConfirmedAt !== null,
      language: user.preference?.language ?? 'FR',
      firstName: user.firstName,
      status: user.status,
    };
  }

  /** The live account whose confirmed contact this is (account recovery, ADR-023). */
  async findAccountIdByContact(identifier: Identifier): Promise<string | null> {
    const candidate = await this.findSignInCandidate(identifier);
    return candidate && candidate.identifierConfirmed && candidate.status !== 'DELETED'
      ? candidate.id
      : null;
  }

  /**
   * Sets an account's e-mail or phone to a contact just proven by a code, confirmed now, and
   * returns the value it replaces. A sign-up never confirmed that holds the same contact is
   * dropped (it could never be used); an account that confirmed it keeps it (ACCOUNT_EXISTS).
   */
  async setContact(userId: string, identifier: Identifier): Promise<string | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.releaseFromUnconfirmed(tx, userId, identifier);
        const before = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { email: true, phone: true },
        });
        await tx.user.update({
          where: { id: userId },
          data:
            identifier.channel === 'EMAIL'
              ? { email: identifier.value, emailConfirmedAt: new Date() }
              : { phone: identifier.value, phoneConfirmedAt: new Date() },
        });
        return identifier.channel === 'EMAIL' ? before.email : before.phone;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('ACCOUNT_EXISTS', 'Another account already uses this contact.');
      }
      throw error;
    }
  }

  /** Removes the e-mail or the phone; the other one must be confirmed, so the person stays reachable. */
  async removeContact(userId: string, channel: Identifier['channel']): Promise<string> {
    const contacts = await this.contactsOf(userId);
    const removed = channel === 'EMAIL' ? contacts?.email : contacts?.phone;
    const otherConfirmed =
      channel === 'EMAIL' ? contacts?.phoneConfirmed : contacts?.emailConfirmed;
    if (!removed) throw new DomainError('NOT_FOUND', 'This contact is not set.');
    if (!otherConfirmed) {
      throw new DomainError('INVALID_STATE', 'Keep at least one confirmed contact.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data:
        channel === 'EMAIL'
          ? { email: null, emailConfirmedAt: null }
          : { phone: null, phoneConfirmedAt: null },
    });
    return removed;
  }

  /**
   * Applies an approved account recovery (ADR-023): the proven contact becomes the only one, and
   * the password is replaced by an unusable one, so only « Mot de passe oublié » on the new
   * contact opens the account. Returns the contacts it replaced.
   */
  async replaceContactsForRecovery(
    userId: string,
    identifier: Identifier,
    unusablePasswordHash: string,
  ): Promise<{ email: string | null; phone: string | null }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.releaseFromUnconfirmed(tx, userId, identifier);
        const before = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { email: true, phone: true },
        });
        const now = new Date();
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(identifier.channel === 'EMAIL'
              ? {
                  email: identifier.value,
                  emailConfirmedAt: now,
                  phone: null,
                  phoneConfirmedAt: null,
                }
              : {
                  phone: identifier.value,
                  phoneConfirmedAt: now,
                  email: null,
                  emailConfirmedAt: null,
                }),
            passwordHash: unusablePasswordHash,
            failedSignInCount: 0,
            lockedUntil: null,
          },
        });
        return before;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('ACCOUNT_EXISTS', 'Another account already uses this contact.');
      }
      throw error;
    }
  }

  /** Drops a never-confirmed sign-up holding this contact, so a confirmed owner can take it. */
  private async releaseFromUnconfirmed(
    tx: Prisma.TransactionClient,
    userId: string,
    identifier: Identifier,
  ): Promise<void> {
    const holder = await tx.user.findUnique({
      where: identifierWhere(identifier),
      select: { id: true, emailConfirmedAt: true, phoneConfirmedAt: true },
    });
    if (!holder || holder.id === userId) return;
    if (holder.emailConfirmedAt === null && holder.phoneConfirmedAt === null) {
      await tx.user.delete({ where: { id: holder.id } });
      return;
    }
    throw new DomainError('ACCOUNT_EXISTS', 'Another account already uses this contact.');
  }

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

  /** Segments of the analytics envelope (section 16): never names or contact data. */
  async analyticsFacts(userId: string): Promise<{
    professionalType: ProfessionalType | null;
    specialtyCode: string | null;
    wilayaCode: number;
  } | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        wilayaCode: true,
        professionalProfile: {
          select: { professionalType: true, specialty: { select: { code: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      professionalType: row.professionalProfile?.professionalType ?? null,
      specialtyCode: row.professionalProfile?.specialty?.code ?? null,
      wilayaCode: row.wilayaCode,
    };
  }

  /** Confirmed accounts created in [from, to) (onboarding funnel). */
  countSignUps(from: Date, to: Date): Promise<number> {
    return this.prisma.user.count({
      where: {
        createdAt: { gte: from, lt: to },
        OR: [{ emailConfirmedAt: { not: null } }, { phoneConfirmedAt: { not: null } }],
      },
    });
  }

  /** Records activity for « Dernière activité »; written at most once an hour per person. */
  async touchLastSeen(userId: string, now = new Date()): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - 3_600_000) } }],
      },
      data: { lastSeenAt: now },
    });
  }

  /** Admin Web « Utilisateurs »: 50 per page, newest first; search on name, e-mail or phone. */
  adminList(filter: {
    search?: string;
    professionalType?: ProfessionalType;
    status?: 'ACTIVE' | 'SUSPENDED';
    cursor?: string;
  }) {
    const search = filter.search?.trim();
    const words = search ? search.split(/\s+/).filter(Boolean).slice(0, 4) : [];
    return this.prisma.user.findMany({
      where: {
        status: filter.status ?? { in: ['ACTIVE', 'SUSPENDED'] },
        OR: [{ emailConfirmedAt: { not: null } }, { phoneConfirmedAt: { not: null } }],
        ...(filter.professionalType
          ? { professionalProfile: { professionalType: filter.professionalType } }
          : {}),
        ...(words.length > 0
          ? {
              AND: words.map((word) => ({
                OR: [
                  { firstName: { contains: word, mode: 'insensitive' as const } },
                  { lastName: { contains: word, mode: 'insensitive' as const } },
                  { email: { contains: word.toLowerCase() } },
                  { phone: { contains: word } },
                ],
              })),
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: ADMIN_USER_SELECT,
    });
  }

  adminDetail(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: ADMIN_USER_SELECT });
  }

  /** Suspension blocks sign-in and refresh (ADR-010); the account and its data are kept. */
  async setStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, status: status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
      data: { status },
    });
    return count === 1;
  }

  /** The password hash of a live account, for a re-authentication (account deletion). */
  async passwordHashOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, passwordHash: true },
    });
    return user && user.status !== 'DELETED' ? user.passwordHash : null;
  }

  /**
   * Account deletion (section 08, Settings « Supprimer le compte »): the person's details,
   * professional profile and preferences are erased and the identifiers freed for a new account.
   * The row stays as a tombstone because payments and past verification decisions keep pointing at
   * it (legal retention, ADR-005). Returns false when the account was already deleted.
   */
  async eraseAccount(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, avatarStorageKey: true },
    });
    if (!user || user.status === 'DELETED') return false;
    await this.prisma.$transaction([
      this.prisma.professionalProfile.deleteMany({ where: { userId } }),
      this.prisma.userPreference.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          email: null,
          phone: null,
          emailConfirmedAt: null,
          phoneConfirmedAt: null,
          firstName: '',
          lastName: '',
          bio: null,
          avatarStorageKey: null,
          passwordHash: '',
          failedSignInCount: 0,
          lockedUntil: null,
        },
      }),
    ]);
    if (user.avatarStorageKey) await this.photos.deleteObject(user.avatarStorageKey);
    return true;
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
      where: {
        emailConfirmedAt: null,
        phoneConfirmedAt: null,
        createdAt: { lt: cutoff },
        status: { not: 'DELETED' },
      },
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
