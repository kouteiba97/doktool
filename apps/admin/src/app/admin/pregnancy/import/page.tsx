'use client';

import { ImportsPage } from '@/features/pregnancy/import-pages';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/pregnancy/import: the import history and the upload. */
export default function Page() {
  return (
    <RequireGrant grant="pregnancy.read">
      <ImportsPage />
    </RequireGrant>
  );
}
