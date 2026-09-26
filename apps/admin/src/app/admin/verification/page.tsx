'use client';

import { VerificationPage } from '@/features/verification/verification-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="verification.queue.read">
      <VerificationPage />
    </RequireGrant>
  );
}
