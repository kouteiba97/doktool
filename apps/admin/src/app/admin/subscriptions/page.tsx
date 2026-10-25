'use client';

import { SubscriptionsPage } from '@/features/subscriptions/subscriptions-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/subscriptions, for admins with subscriptions.read. */
export default function Page() {
  return (
    <RequireGrant grant="subscriptions.read">
      <SubscriptionsPage />
    </RequireGrant>
  );
}
