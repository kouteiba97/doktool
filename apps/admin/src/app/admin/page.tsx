'use client';

import { ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useI18n } from '@/i18n/i18n-provider';
import { useMe } from '@/session/session';
import { homeFor } from '@/shell/nav';
import { EmptyState } from '@/ui/feedback';

/** `/admin` opens the first section the admin's grants allow. */
export default function AdminHome() {
  const { t } = useI18n();
  const router = useRouter();
  const me = useMe().data;
  const home = me ? homeFor(me.grants) : null;
  useEffect(() => {
    if (home) router.replace(home);
  }, [home, router]);
  if (!me || home) return null;
  return (
    <EmptyState icon={ShieldOff} title={t('admin.access.noSectionTitle')}>
      {t('admin.access.noSectionBody')}
    </EmptyState>
  );
}
