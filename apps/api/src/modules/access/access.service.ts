import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import type { Viewer } from '../../infrastructure/security/viewer-auth.guard.js';
import { SubscriptionStatusService } from '../billing/index.js';
import { UsersService } from '../users/index.js';
import { VerificationStatusService } from '../verification/index.js';
import { decideItem, evaluateAccess } from './access-policy.js';
import type { AccessibleItem, AccessInputs, AccessProfile, ItemAccess } from './access.types.js';

/**
 * The only place access is decided (ADR-004). Gathers the inputs from the owning modules and
 * evaluates the policy for each request; nothing is cached or stored.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly users: UsersService,
    private readonly verification: VerificationStatusService,
    private readonly subscriptions: SubscriptionStatusService,
  ) {}

  async profileFor(viewer: Viewer): Promise<AccessProfile> {
    return evaluateAccess(await this.inputsFor(viewer));
  }

  /** Decides many items at once for list and search endpoints. */
  async decideItems<T extends AccessibleItem>(
    viewer: Viewer,
    items: readonly T[],
  ): Promise<{ profile: AccessProfile; decisions: ItemAccess[] }> {
    const profile = await this.profileFor(viewer);
    return { profile, decisions: items.map((item) => decideItem(profile, item)) };
  }

  private async inputsFor(viewer: Viewer): Promise<AccessInputs> {
    if (viewer.accessContext === 'DEMO') {
      return { accessContext: 'DEMO', demoContext: viewer.demoContext };
    }
    const [account, verification, subscription] = await Promise.all([
      this.users.getAccessFacts(viewer.userId),
      this.verification.snapshot(viewer.userId),
      this.subscriptions.current(viewer.userId),
    ]);
    if (!account || account.status === 'DELETED') {
      throw new DomainError('UNAUTHENTICATED', 'Account not found.');
    }
    return { accessContext: 'AUTHENTICATED', account, verification, subscription };
  }
}
