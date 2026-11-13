'use client';

import { VerificationPage } from '@/features/verification/verification-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/verification, for admins with verification.queue.read. */
export default function Page() {
  return (
    <RequireGrant grant="verification.queue.read">
      <VerificationPage />
    </RequireGrant>
  );
}
