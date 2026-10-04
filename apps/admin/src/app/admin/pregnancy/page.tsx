'use client';

import { PregnancyPage } from '@/features/pregnancy/pregnancy-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="pregnancy.read">
      <PregnancyPage />
    </RequireGrant>
  );
}
