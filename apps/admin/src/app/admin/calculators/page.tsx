'use client';

import { CalculatorsPage } from '@/features/calculators/calculators-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/calculators, for admins with calculators.read. */
export default function Page() {
  return (
    <RequireGrant grant="calculators.read">
      <CalculatorsPage />
    </RequireGrant>
  );
}
