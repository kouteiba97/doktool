'use client';

import { ImportsPage } from '@/features/pregnancy/import-pages';
import { RequireGrant } from '@/shell/require-grant';

export default function Page() {
  return (
    <RequireGrant grant="pregnancy.read">
      <ImportsPage />
    </RequireGrant>
  );
}
