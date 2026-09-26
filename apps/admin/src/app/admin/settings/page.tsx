'use client';

import { ReferenceDataPage } from '@/features/settings/reference-data-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="system.settings.write">
      <ReferenceDataPage />
    </RequireGrant>
  );
}
