import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import { ActivityService } from '../activity/index.js';
import { AuditService } from '../audit/index.js';
import { SubscriptionStatusService } from '../billing/index.js';
import { NotificationsService } from '../notifications/index.js';
import { PregnancyService } from '../pregnancy/index.js';
import { UsersService } from '../users/index.js';
import { VerificationMaintenanceService } from '../verification/index.js';
import { RATE_LIMITS } from './auth.policy.js';
import { OtpService } from './otp.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * « Supprimer le compte » (section 08, Settings): after the password is confirmed, each module
 * erases what it holds about the person — favorites and history, notifications, verification
 * documents, codes, profile — then every session ends. A live subscription stops without refund
 * (ADR-005); payments and past verification decisions are kept against an anonymous tombstone.
 * Every step can run again, so a failure part-way is retried by the person asking again.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly otp: OtpService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly pregnancy: PregnancyService,
    private readonly verification: VerificationMaintenanceService,
    private readonly subscriptions: SubscriptionStatusService,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
    private readonly limiter: RateLimiter,
  ) {}

  async delete(userId: string, password: string, client: ClientInfo): Promise<void> {
    await this.limiter.hit(RATE_LIMITS.deleteAccountPerUser, userId);
    const passwordHash = await this.users.passwordHashOf(userId);
    if (!passwordHash) throw new DomainError('UNAUTHENTICATED', 'The account no longer exists.');
    // A form error on the password field, not a 401: the session itself is fine.
    if (!(await this.hasher.verify(passwordHash, password))) {
      throw new DomainError('VALIDATION_FAILED', 'Wrong password.', {
        fields: { password: ['Wrong password.'] },
      });
    }

    const subscriptionsEnded = await this.subscriptions.endForDeletedAccount(userId);
    const documentsDeleted = await this.verification.eraseUser(userId);
    await this.activity.eraseUser(userId);
    await this.notifications.eraseUser(userId);
    await this.pregnancy.eraseUser(userId);
    await this.otp.eraseUser(userId);
    await this.users.eraseAccount(userId);
    await this.sessions.revokeAll(userId, 'ACCOUNT_DELETED');
    await this.audit.record({
      actorType: 'USER',
      actorId: userId,
      action: 'user.account_deleted',
      entityType: 'User',
      entityId: userId,
      after: { subscriptionsEnded, documentsDeleted },
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
