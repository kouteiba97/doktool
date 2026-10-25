'use client';

import { AnalyticsPage } from '@/features/analytics/analytics-page';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/analytics, for admins with analytics.read. */
export default function Page() {
  return (
    <RequireGrant grant="analytics.read">
      <AnalyticsPage />
    </RequireGrant>
  );
}
