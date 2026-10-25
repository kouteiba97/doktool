'use client';

import { use } from 'react';
import { ImportPreviewPage } from '@/features/pregnancy/import-pages';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/pregnancy/import/:id: one import's preview. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireGrant grant="pregnancy.read">
      <ImportPreviewPage id={id} />
    </RequireGrant>
  );
}
