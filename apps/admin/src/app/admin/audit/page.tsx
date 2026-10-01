'use client';

import { AuditPage } from '@/features/audit/audit-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="audit.read">
      <AuditPage />
    </RequireGrant>
  );
}
