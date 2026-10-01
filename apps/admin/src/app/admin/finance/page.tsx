'use client';

import { FinancePage } from '@/features/finance/finance-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="finance.read">
      <FinancePage />
    </RequireGrant>
  );
}
