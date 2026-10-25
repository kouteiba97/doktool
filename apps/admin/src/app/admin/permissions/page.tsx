'use client';

import { PermissionsPage } from '@/features/permissions/permissions-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/permissions, for admins with system.roles.write. */
export default function Page() {
  return (
    <RequireGrant grant="system.roles.write">
      <PermissionsPage />
    </RequireGrant>
  );
}
