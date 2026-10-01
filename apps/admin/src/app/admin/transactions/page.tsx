'use client';

import { TransactionsPage } from '@/features/transactions/transactions-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="transactions.read">
      <TransactionsPage />
    </RequireGrant>
  );
}
