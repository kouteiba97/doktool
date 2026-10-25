'use client';

import { TransactionsPage } from '@/features/transactions/transactions-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/transactions, for admins with transactions.read. */
export default function Page() {
  return (
    <RequireGrant grant="transactions.read">
      <TransactionsPage />
    </RequireGrant>
  );
}
