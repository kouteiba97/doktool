import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  type Grant,
  isGrant,
  PRESETS,
  type Preset,
  separationOfDutiesViolations,
} from './grants.js';

export interface NewAdminAccount {
  email: string;
  fullName: string;
  password: string;
  preset: Preset;
  /** Admin granting the preset; null only when bootstrapping the first Super Admin. */
  grantedById: string | null;
}

/** Owner of `admin_accounts` and `admin_grants`. */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
  ) {}

  async create(input: NewAdminAccount): Promise<{ id: string }> {
    const grants: readonly Grant[] = PRESETS[input.preset];
    const violations = separationOfDutiesViolations(grants, input.preset === 'SUPER_ADMIN');
    if (violations.length > 0) {
      throw new DomainError('VALIDATION_FAILED', violations.join('; '));
    }
    try {
      return await this.prisma.adminAccount.create({
        data: {
          email: input.email.trim().toLowerCase(),
          fullName: input.fullName.trim(),
          passwordHash: await this.hasher.hash(input.password),
          grants: {
            create: grants.map((grant) => ({ grant, grantedById: input.grantedById })),
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('ACCOUNT_EXISTS', 'An admin account already uses this e-mail.');
      }
      throw error;
    }
  }

  /** Non-expired grants of an admin, sorted. */
  async effectiveGrants(adminId: string): Promise<Grant[]> {
    const rows = await this.prisma.adminGrant.findMany({
      where: { adminId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { grant: true },
    });
    return rows
      .map((row) => row.grant)
      .filter(isGrant)
      .sort();
  }
}
