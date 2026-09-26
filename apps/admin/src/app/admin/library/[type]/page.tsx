'use client';

import { notFound } from 'next/navigation';
import { use } from 'react';
import { TYPE_SEGMENTS } from '@/features/library/labels';
import { LibraryPage } from '@/features/library/library-page';
import { RequireGrant } from '@/shell/require-grant';

export default function Page({ params }: { params: Promise<{ type: string }> }) {
  const type = TYPE_SEGMENTS[use(params).type];
  if (!type) notFound();
  return (
    <RequireGrant grant="library.read">
      <LibraryPage type={type} />
    </RequireGrant>
  );
}
