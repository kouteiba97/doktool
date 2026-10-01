'use client';

import { UsersPage } from '@/features/users/users-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="users.read">
      <UsersPage />
    </RequireGrant>
  );
}
