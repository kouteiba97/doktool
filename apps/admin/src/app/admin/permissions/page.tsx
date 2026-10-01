'use client';

import { PermissionsPage } from '@/features/permissions/permissions-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="system.roles.write">
      <PermissionsPage />
    </RequireGrant>
  );
}
