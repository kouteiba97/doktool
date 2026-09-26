'use client';

import { CalculatorsPage } from '@/features/calculators/calculators-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="calculators.read">
      <CalculatorsPage />
    </RequireGrant>
  );
}
