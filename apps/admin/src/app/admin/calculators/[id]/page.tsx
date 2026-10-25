'use client';

import { use } from 'react';
import { CalculatorDetail } from '@/features/calculators/calculator-detail';
import { RequireGrant } from '@/shell/require-grant';

/** /admin/calculators/:id: one calculator. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireGrant grant="calculators.read">
      <CalculatorDetail id={id} />
    </RequireGrant>
  );
}
