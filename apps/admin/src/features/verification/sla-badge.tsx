'use client';

import { Clock } from 'lucide-react';
import { useI18n } from '@/i18n/i18n-provider';
import { formatAge, formatDateTime, hoursSince } from '@/i18n/format';
import { Badge } from '@/ui/badge';
import { VERIFICATION_SLA_HOURS } from './labels';

/** « Soumis »: age as a word plus colour; past the SLA it also says so (never colour alone). */
export function SlaBadge({ since, waiting }: { since: string | null; waiting: boolean }) {
  const { t, locale } = useI18n();
  if (!since) return <span className="dt-cap">—</span>;
  const age = formatAge(locale, since);
  const late = waiting && hoursSince(since) >= VERIFICATION_SLA_HOURS;
  return (
    <span title={formatDateTime(locale, since)}>
      {late ? (
        <Badge tone="warning">
          <Clock aria-hidden />
          {t('admin.verification.slaLate', { age })}
        </Badge>
      ) : (
        <Badge tone="neutral">{age}</Badge>
      )}
    </span>
  );
}
