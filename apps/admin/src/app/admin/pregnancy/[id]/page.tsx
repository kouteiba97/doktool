'use client';

import { use } from 'react';
import { SubstanceDetailPage } from '@/features/pregnancy/substance-detail';
import { RequireGrant } from '@/shell/require-grant';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireGrant grant="pregnancy.read">
      <SubstanceDetailPage id={id} />
    </RequireGrant>
  );
}
