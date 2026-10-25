'use client';

import { RecoveryPage } from '@/features/recovery/recovery-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/recovery, for admins with verification.queue.read. */
export default function Page() {
  return (
    <RequireGrant grant="verification.queue.read">
      <RecoveryPage />
    </RequireGrant>
  );
}
