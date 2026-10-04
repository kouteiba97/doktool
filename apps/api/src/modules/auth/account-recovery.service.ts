import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { ClientInfo } from '../../common/http/client-info.js';
import type {
  AccountRecoveryRequest,
  Language,
  Prisma,
  RecoveryStatus,
} from '../../generated/prisma/client.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { randomToken, sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MessageDelivery } from '../../infrastructure/messaging/message-delivery.js';
import { RateLimiter } from '../../infrastructure/rate-limit/rate-limiter.js';
import type { AdminPrincipal } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import {
  SIGNED_READ_TTL,
  StorageKeys,
  StorageService,
  UploadIntentsService,
  type UploadTicket,
} from '../storage/index.js';
import { type Identifier, parseIdentifier, UsersService } from '../users/index.js';
import { VerificationStatusService } from '../verification/index.js';
import {
  DAY_MS,
  RATE_LIMITS,
  RECOVERY_DOCUMENT_RETENTION_DAYS,
  RECOVERY_DOCUMENTS_TTL_MINUTES,
  RECOVERY_HOLD_HOURS,
  RECOVERY_REVIEW_HOURS,
  type RecoveryRejectionReason,
} from './auth.policy.js';
import { type OtpChallengeView, OtpService } from './otp.service.js';
import { type Destination, SecurityNoticesService } from './security-notices.service.js';
import { SessionsService } from './sessions.service.js';

export type RecoverySlot = 'IDENTITY_DOCUMENT' | 'SELFIE';
const SLOT_FOLDERS: Record<RecoverySlot, 'identity' | 'selfie'> = {
  IDENTITY_DOCUMENT: 'identity',
  SELFIE: 'selfie',
};
const EXTENSIONS: Record<string, 'jpg' | 'png'> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const OPEN: RecoveryStatus[] = ['SUBMITTED', 'APPROVED'];

const clientKey = (client: ClientInfo) => client.ip ?? 'unknown';
const hoursFromNow = (hours: number, now = new Date()) =>
  new Date(now.getTime() + hours * 3_600_000);

export interface RecoveryStarted {
  requestId: string;
  challenge: OtpChallengeView;
}

export interface RecoveryAdminFilter {
  status?: RecoveryStatus;
}

function requireIdentifier(raw: string, field: string): Identifier {
  const identifier = parseIdentifier(raw);
  if (!identifier) {
    throw new DomainError('VALIDATION_FAILED', 'Enter a valid e-mail address or mobile number.', {
      fields: { [field]: ['Enter a valid e-mail address or mobile number.'] },
    });
  }
  return identifier;
}

const destinationOf = (request: Pick<AccountRecoveryRequest, 'newChannel' | 'newDestination'>) =>
  ({ channel: request.newChannel, to: request.newDestination }) satisfies Destination;

/**
 * Assisted account recovery (ADR-023): « J’ai perdu l’accès à mon e-mail et à mon téléphone ».
 *
 * 1. The person names the lost contact, their name and a NEW contact, and proves the new contact
 *    with a code. A recovery token (kept by the app only) then allows two photo uploads: an
 *    identity document and a selfie holding it.
 * 2. The account's current contacts are warned; the owner signing in cancels the request.
 * 3. A reviewer (`verification.review`) compares the photos with the account and decides.
 * 4. An approval applies after RECOVERY_HOLD_HOURS: the new contact becomes the only contact, the
 *    password becomes unusable and every device signs out; the person then sets a password with
 *    « Mot de passe oublié » on the new contact. Photos are deleted 30 days after the decision.
 */
@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
    private readonly delivery: MessageDelivery,
    private readonly limiter: RateLimiter,
    private readonly intents: UploadIntentsService,
    private readonly storage: StorageService,
    private readonly notices: SecurityNoticesService,
    private readonly verification: VerificationStatusService,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
  ) {}

  // ─────────────────────────────── the person ───────────────────────────────

  async start(
    input: {
      lostIdentifier: string;
      newIdentifier: string;
      firstName: string;
      lastName: string;
      language: Language;
    },
    client: ClientInfo,
  ): Promise<RecoveryStarted> {
    await this.limiter.hit(RATE_LIMITS.recoveryPerIp, clientKey(client));
    const lost = requireIdentifier(input.lostIdentifier, 'lostIdentifier');
    const fresh = requireIdentifier(input.newIdentifier, 'newIdentifier');
    if (lost.value === fresh.value) {
      throw new DomainError('VALIDATION_FAILED', 'The new contact must differ from the lost one.', {
        fields: { newIdentifier: ['The new contact must differ from the lost one.'] },
      });
    }
    if (!this.delivery.canReach(fresh.channel, fresh.value)) {
      throw new DomainError('CHANNEL_UNAVAILABLE', 'Codes cannot be sent to this contact.');
    }
    await this.limiter.hit(RATE_LIMITS.recoveryPerClaimed, lost.value);
    await this.limiter.hit(RATE_LIMITS.recoveryPerNewContact, fresh.value);
    const request = await this.prisma.accountRecoveryRequest.create({
      data: {
        claimedIdentifier: lost.value,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        newChannel: fresh.channel,
        newDestination: fresh.value,
        language: input.language,
        // Unusable until the new contact is proven (the real token replaces it).
        tokenHash: sha256Hex(randomToken()),
      },
    });
    const challenge = await this.otp.issue('ACCOUNT_RECOVERY', fresh, null, input.language);
    return { requestId: request.id, challenge };
  }

  /** The new contact is proven: returns the token that allows the photos and the submission. */
  async confirmContact(
    input: { requestId: string; challengeId: string; code: string },
    client: ClientInfo,
  ): Promise<{ recoveryToken: string; expiresAt: Date }> {
    await this.limiter.hit(RATE_LIMITS.otpVerifyPerIp, clientKey(client));
    const request = await this.awaiting(input.requestId);
    const proof = await this.otp.consumeContactProof(input.challengeId, input.code);
    if (proof.channel !== request.newChannel || proof.destination !== request.newDestination) {
      throw new DomainError('OTP_EXPIRED', 'This code is not for this request.');
    }
    // The person proved they own this contact: if it already opens an account, say so.
    if (
      await this.users.findAccountIdByContact({
        channel: proof.channel,
        value: proof.destination,
      })
    ) {
      throw new DomainError(
        'ACCOUNT_EXISTS',
        'This contact already opens an account: sign in with it.',
      );
    }
    const recoveryToken = randomToken();
    await this.prisma.accountRecoveryRequest.update({
      where: { id: request.id },
      data: { tokenHash: sha256Hex(recoveryToken) },
    });
    return { recoveryToken, expiresAt: this.documentsDeadline(request) };
  }

  /** A signed upload for one of the two photos (private bucket, JPEG or PNG, 10 MB). */
  async requestUpload(
    recoveryToken: string,
    input: { slot: RecoverySlot; contentType: string; sizeBytes: number; sha256: string },
  ): Promise<UploadTicket> {
    const request = await this.byToken(recoveryToken);
    const extension = EXTENSIONS[input.contentType];
    if (!extension) {
      throw new DomainError('VALIDATION_FAILED', 'The upload is not acceptable.', {
        fields: { contentType: ['Send a JPEG or PNG photo.'] },
      });
    }
    await this.limiter.hit(RATE_LIMITS.recoveryUploadPerRequest, request.id);
    return this.intents.create({
      purpose: 'RECOVERY_DOCUMENT',
      key: StorageKeys.recoveryDocument(
        request.id,
        SLOT_FOLDERS[input.slot],
        randomUUID(),
        extension,
      ),
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      requestedBy: { type: 'RECOVERY_REQUEST', id: request.id },
    });
  }

  /** Confirms an uploaded photo and puts it in its slot (replacing a previous one). */
  async attach(
    recoveryToken: string,
    input: { slot: RecoverySlot; intentId: string },
  ): Promise<void> {
    const request = await this.byToken(recoveryToken);
    const stored = await this.intents.confirm(input.intentId, {
      type: 'RECOVERY_REQUEST',
      id: request.id,
    });
    const prefix = `doktool/recovery/${request.id}/${SLOT_FOLDERS[input.slot]}-`;
    if (stored.purpose !== 'RECOVERY_DOCUMENT' || !stored.key.startsWith(prefix)) {
      await this.deleteObject(stored.key);
      throw new DomainError('UPLOAD_INVALID', 'This upload does not belong to this photo.');
    }
    const field = input.slot === 'IDENTITY_DOCUMENT' ? 'identityDocumentKey' : 'selfieKey';
    const previous = request[field];
    await this.prisma.accountRecoveryRequest.update({
      where: { id: request.id },
      data: { [field]: stored.key },
    });
    if (previous) await this.deleteObject(previous);
  }

  /** « Envoyer »: both photos are there; the request goes to the review queue. */
  async submit(recoveryToken: string, client: ClientInfo): Promise<{ answerWithinHours: number }> {
    const request = await this.byToken(recoveryToken);
    if (!request.identityDocumentKey || !request.selfieKey) {
      throw new DomainError('VALIDATION_FAILED', 'Both photos are needed.', {
        fields: {
          photos: [
            ...(request.identityDocumentKey ? [] : ['IDENTITY_DOCUMENT']),
            ...(request.selfieKey ? [] : ['SELFIE']),
          ],
        },
      });
    }
    const claimed = parseIdentifier(request.claimedIdentifier)!;
    const userId = await this.users.findAccountIdByContact(claimed);
    const { count } = await this.prisma.accountRecoveryRequest.updateMany({
      where: { id: request.id, status: 'AWAITING_DOCUMENTS' },
      data: { status: 'SUBMITTED', submittedAt: new Date(), userId },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'This request was already sent.');
    await this.audit.record({
      actorType: 'SYSTEM',
      actorId: null,
      action: 'account_recovery.submitted',
      entityType: 'AccountRecoveryRequest',
      entityId: request.id,
      after: { matchedAccount: userId !== null, newChannel: request.newChannel },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    await this.notices.toRecoveryContact(
      destinationOf(request),
      'recoveryReceived',
      request.language,
      {
        hours: String(RECOVERY_REVIEW_HOURS),
      },
    );
    // Warn the owner on the current contacts: if it is not them, signing in cancels it.
    if (userId) await this.notices.notify(userId, 'recoveryRequested');
    return { answerWithinHours: RECOVERY_REVIEW_HOURS };
  }

  /** A recovery of this account waiting for review or for its waiting period, if any. */
  async openForUser(
    userId: string,
  ): Promise<{ status: RecoveryStatus; effectiveAt: Date | null } | null> {
    const open = await this.prisma.accountRecoveryRequest.findFirst({
      where: { userId, status: { in: OPEN } },
      orderBy: { submittedAt: 'desc' },
      select: { status: true, effectiveAt: true },
    });
    return open;
  }

  /**
   * Signing in with the password, or « Ce n’est pas moi » in Settings, proves the owner still has
   * the account: open requests stop.
   */
  async cancelForOwner(userId: string): Promise<void> {
    const open = await this.prisma.accountRecoveryRequest.findMany({
      where: { userId, status: { in: OPEN } },
    });
    for (const request of open) {
      const { count } = await this.prisma.accountRecoveryRequest.updateMany({
        where: { id: request.id, status: { in: OPEN } },
        data: { status: 'CANCELED', documentsPurgeAfter: this.purgeDate() },
      });
      if (count !== 1) continue;
      await this.audit.record({
        actorType: 'USER',
        actorId: userId,
        action: 'account_recovery.canceled_by_owner',
        entityType: 'AccountRecoveryRequest',
        entityId: request.id,
      });
      await this.notices.toRecoveryContact(
        destinationOf(request),
        'recoveryCanceled',
        request.language,
      );
    }
  }

  // ─────────────────────────────── Admin Web ───────────────────────────────

  async list(filter: RecoveryAdminFilter) {
    const rows = await this.prisma.accountRecoveryRequest.findMany({
      where: filter.status ? { status: filter.status } : { status: { not: 'AWAITING_DOCUMENTS' } },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows;
  }

  async detail(id: string) {
    const request = await this.find(id);
    const account = request.userId ? await this.users.reviewSummary(request.userId) : null;
    const verification = request.userId ? await this.verification.snapshot(request.userId) : null;
    return { request, account, verification };
  }

  /** Restricted viewer: a 60-second signed URL to one photo; every view is audited. */
  async viewPhoto(admin: AdminPrincipal, id: string, slot: RecoverySlot, client: ClientInfo) {
    const request = await this.find(id);
    const key = slot === 'IDENTITY_DOCUMENT' ? request.identityDocumentKey : request.selfieKey;
    if (!key) throw new DomainError('NOT_FOUND', 'This photo is no longer kept.');
    const ttl = SIGNED_READ_TTL.recoveryDocument;
    const now = new Date();
    const url = await this.storage.getSignedReadUrl('PRIVATE', key, { ttlSeconds: ttl });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action: 'account_recovery.photo_viewed',
      entityType: 'AccountRecoveryRequest',
      entityId: id,
      after: { slot },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return {
      url,
      expiresAt: new Date(now.getTime() + ttl * 1000),
      contentType: key.endsWith('.png') ? 'image/png' : 'image/jpeg',
      watermark: `${admin.fullName} · ${admin.email} · ${now.toISOString()}`,
    };
  }

  async approve(admin: AdminPrincipal, id: string, note: string, client: ClientInfo) {
    const request = await this.find(id);
    if (request.status !== 'SUBMITTED')
      throw new DomainError('INVALID_STATE', 'Not waiting for a decision.');
    if (!request.userId) {
      throw new DomainError(
        'INVALID_STATE',
        'No account matches this request: reject it (NO_ACCOUNT).',
      );
    }
    const now = new Date();
    const effectiveAt = hoursFromNow(RECOVERY_HOLD_HOURS, now);
    const { count } = await this.prisma.accountRecoveryRequest.updateMany({
      where: { id, status: 'SUBMITTED' },
      data: {
        status: 'APPROVED',
        decidedAt: now,
        decidedById: admin.adminId,
        decisionNote: note,
        effectiveAt,
      },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'Not waiting for a decision.');
    await this.record(
      admin,
      client,
      'account_recovery.approved',
      id,
      { effectiveAt: effectiveAt.toISOString() },
      note,
    );
    const when = effectiveAt;
    await this.notices.toRecoveryContact(
      destinationOf(request),
      'recoveryAccepted',
      request.language,
      {
        date: when,
      },
    );
    await this.notices.notify(request.userId, 'recoveryApproved', { date: when });
    return this.detail(id);
  }

  async reject(
    admin: AdminPrincipal,
    id: string,
    input: { reason: RecoveryRejectionReason; note: string },
    client: ClientInfo,
  ) {
    const request = await this.find(id);
    if (request.status !== 'SUBMITTED' && request.status !== 'APPROVED') {
      throw new DomainError('INVALID_STATE', 'This request is already closed.');
    }
    const { count } = await this.prisma.accountRecoveryRequest.updateMany({
      where: { id, status: request.status },
      data: {
        status: 'REJECTED',
        decidedAt: new Date(),
        decidedById: admin.adminId,
        rejectionReason: input.reason,
        decisionNote: input.note,
        effectiveAt: null,
        documentsPurgeAfter: this.purgeDate(),
      },
    });
    if (count !== 1) throw new DomainError('INVALID_STATE', 'This request changed meanwhile.');
    await this.record(
      admin,
      client,
      'account_recovery.rejected',
      id,
      { reason: input.reason },
      input.note,
    );
    await this.notices.toRecoveryContact(
      destinationOf(request),
      'recoveryRejected',
      request.language,
      {
        reason: input.reason,
      },
    );
    return this.detail(id);
  }

  // ─────────────────────────────── jobs ───────────────────────────────

  /** Applies approvals whose waiting period is over (every 10 minutes). */
  async applyDue(now = new Date()): Promise<number> {
    const due = await this.prisma.accountRecoveryRequest.findMany({
      where: { status: 'APPROVED', effectiveAt: { lte: now } },
      take: 100,
    });
    let applied = 0;
    for (const request of due) {
      try {
        await this.apply(request, now);
        applied += 1;
      } catch (error) {
        this.logger.error(`Could not apply account recovery ${request.id}`, error);
      }
    }
    return applied;
  }

  /** Expires requests whose photos never came, and deletes photos past their retention. */
  async maintain(now = new Date()): Promise<void> {
    const stale = await this.prisma.accountRecoveryRequest.findMany({
      where: {
        status: 'AWAITING_DOCUMENTS',
        createdAt: { lt: new Date(now.getTime() - RECOVERY_DOCUMENTS_TTL_MINUTES * 60_000) },
      },
      select: { id: true },
      take: 500,
    });
    for (const { id } of stale) {
      await this.prisma.accountRecoveryRequest.updateMany({
        where: { id, status: 'AWAITING_DOCUMENTS' },
        data: { status: 'EXPIRED', documentsPurgeAfter: now },
      });
    }
    const purgeable = await this.prisma.accountRecoveryRequest.findMany({
      where: { documentsPurgeAfter: { lte: now } },
      select: { id: true, identityDocumentKey: true, selfieKey: true },
      take: 500,
    });
    for (const request of purgeable) {
      for (const key of [request.identityDocumentKey, request.selfieKey]) {
        if (key) await this.deleteObject(key);
      }
      await this.prisma.accountRecoveryRequest.update({
        where: { id: request.id },
        data: { identityDocumentKey: null, selfieKey: null, documentsPurgeAfter: null },
      });
    }
    // Requests that never got past the code keep nothing worth keeping after a week.
    await this.prisma.accountRecoveryRequest.deleteMany({
      where: {
        status: 'EXPIRED',
        submittedAt: null,
        createdAt: { lt: new Date(now.getTime() - 7 * DAY_MS) },
      },
    });
  }

  /** Account deletion: open requests stop and their photos are deleted now. */
  async eraseUser(userId: string): Promise<void> {
    await this.prisma.accountRecoveryRequest.updateMany({
      where: { userId, status: { in: OPEN } },
      data: { status: 'CANCELED' },
    });
    await this.prisma.accountRecoveryRequest.updateMany({
      where: { userId, OR: [{ identityDocumentKey: { not: null } }, { selfieKey: { not: null } }] },
      data: { documentsPurgeAfter: new Date() },
    });
    await this.maintain();
  }

  // ─────────────────────────────── helpers ───────────────────────────────

  private async apply(request: AccountRecoveryRequest, now: Date): Promise<void> {
    const identifier = { channel: request.newChannel, value: request.newDestination };
    let replaced: { email: string | null; phone: string | null };
    try {
      replaced = await this.users.replaceContactsForRecovery(
        request.userId!,
        identifier,
        await this.hasher.hash(randomToken()),
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === 'ACCOUNT_EXISTS') {
        // The new contact was taken by another account during the wait: stop, explain.
        await this.prisma.accountRecoveryRequest.update({
          where: { id: request.id },
          data: { status: 'CANCELED', documentsPurgeAfter: this.purgeDate(now) },
        });
        await this.notices.toRecoveryContact(
          destinationOf(request),
          'recoveryCanceled',
          request.language,
        );
        return;
      }
      throw error;
    }
    const { count } = await this.prisma.accountRecoveryRequest.updateMany({
      where: { id: request.id, status: 'APPROVED' },
      data: { status: 'APPLIED', appliedAt: now, documentsPurgeAfter: this.purgeDate(now) },
    });
    if (count !== 1) return;
    await this.sessions.revokeAll(request.userId!, 'ACCOUNT_RECOVERED');
    await this.audit.record({
      actorType: 'SYSTEM',
      actorId: null,
      action: 'account_recovery.applied',
      entityType: 'User',
      entityId: request.userId!,
      after: { requestId: request.id, newChannel: request.newChannel },
    });
    const previous: Destination[] = [
      ...(replaced.email ? [{ channel: 'EMAIL' as const, to: replaced.email }] : []),
      ...(replaced.phone && !replaced.email
        ? [{ channel: 'SMS' as const, to: replaced.phone }]
        : []),
    ].filter((destination) => destination.to !== request.newDestination);
    for (const destination of previous) {
      await this.notices.toRecoveryContact(destination, 'recoveryApplied', request.language);
    }
    await this.notices.toRecoveryContact(
      destinationOf(request),
      'recoveryRestored',
      request.language,
      {
        contact: request.newDestination,
      },
    );
  }

  private async awaiting(id: string): Promise<AccountRecoveryRequest> {
    const request = await this.prisma.accountRecoveryRequest.findUnique({ where: { id } });
    if (
      !request ||
      request.status !== 'AWAITING_DOCUMENTS' ||
      this.documentsDeadline(request) <= new Date()
    ) {
      throw new DomainError('OTP_EXPIRED', 'This request has expired; start again.');
    }
    return request;
  }

  private async byToken(recoveryToken: string): Promise<AccountRecoveryRequest> {
    const request = await this.prisma.accountRecoveryRequest.findUnique({
      where: { tokenHash: sha256Hex(recoveryToken) },
    });
    if (
      !request ||
      request.status !== 'AWAITING_DOCUMENTS' ||
      this.documentsDeadline(request) <= new Date()
    ) {
      throw new DomainError('CHALLENGE_INVALID', 'This request has expired; start again.');
    }
    return request;
  }

  private async find(id: string): Promise<AccountRecoveryRequest> {
    const request = await this.prisma.accountRecoveryRequest.findUnique({ where: { id } });
    if (!request || request.status === 'AWAITING_DOCUMENTS') {
      throw new DomainError('NOT_FOUND', 'Recovery request not found.');
    }
    return request;
  }

  private documentsDeadline(request: Pick<AccountRecoveryRequest, 'createdAt'>): Date {
    return new Date(request.createdAt.getTime() + RECOVERY_DOCUMENTS_TTL_MINUTES * 60_000);
  }

  private purgeDate(now = new Date()): Date {
    return new Date(now.getTime() + RECOVERY_DOCUMENT_RETENTION_DAYS * DAY_MS);
  }

  private async deleteObject(key: string): Promise<void> {
    try {
      await this.storage.delete('PRIVATE', key);
    } catch (error) {
      this.logger.error(`Could not delete recovery photo ${key}`, error);
    }
  }

  private async record(
    admin: AdminPrincipal,
    client: ClientInfo,
    action: string,
    id: string,
    after: Prisma.InputJsonObject,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.adminId,
      action,
      entityType: 'AccountRecoveryRequest',
      entityId: id,
      after,
      reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }
}
