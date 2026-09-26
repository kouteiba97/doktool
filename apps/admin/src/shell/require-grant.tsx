'use client';

import { ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/i18n-provider';
import { type Grant, useGrants } from '@/session/session';
import { EmptyState } from '@/ui/feedback';

/** A section opened without its grant (typed URL) says so instead of failing API calls. */
export function RequireGrant({ grant, children }: { grant: Grant; children: ReactNode }) {
  const { t } = useI18n();
  const { has, me } = useGrants();
  if (!me) return null;
  if (!has(grant)) {
    return (
      <EmptyState icon={ShieldOff} title={t('admin.access.deniedTitle')}>
        {t('admin.access.deniedBody', { grant })}
      </EmptyState>
    );
  }
  return <>{children}</>;
}
