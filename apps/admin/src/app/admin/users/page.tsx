'use client';

import { UsersPage } from '@/features/users/users-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/users, for admins with users.read. */
export default function Page() {
  return (
    <RequireGrant grant="users.read">
      <UsersPage />
    </RequireGrant>
  );
}
