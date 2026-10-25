'use client';

import { ReferenceDataPage } from '@/features/settings/reference-data-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/settings: pickers and the sign-off policy (system.settings.write). */
export default function Page() {
  return (
    <RequireGrant grant="system.settings.write">
      <ReferenceDataPage />
    </RequireGrant>
  );
}
