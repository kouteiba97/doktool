'use client';

import { FinancePage } from '@/features/finance/finance-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/finance, for admins with finance.read. */
export default function Page() {
  return (
    <RequireGrant grant="finance.read">
      <FinancePage />
    </RequireGrant>
  );
}
