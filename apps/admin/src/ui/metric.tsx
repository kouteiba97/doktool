'use client';

import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/i18n-provider';

/**
 * One figure of a ledger strip (component MetricTile): label, value, change against the previous
 * period as a word and an arrow (never colour alone), optional note (« estimé »).
 */
export function Metric({
  label,
  value,
  current,
  previous,
  note,
  emphasis,
}: {
  label: ReactNode;
  value: ReactNode;
  current?: number | null;
  previous?: number | null;
  note?: ReactNode;
  emphasis?: boolean;
}) {
  const { t, locale } = useI18n();
  let change: ReactNode = null;
  if (current !== undefined && previous !== undefined && current !== null && previous !== null) {
    if (previous === 0) {
      change =
        current === 0 ? null : <span className="dt-cap">{t('admin.metric.newThisPeriod')}</span>;
    } else {
      const ratio = (current - previous) / Math.abs(previous);
      const percent = new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 1,
        signDisplay: 'exceptZero',
      }).format(ratio);
      change = (
        <span className="dt-cap inline-flex items-center gap-1">
          {ratio > 0 ? (
            <ArrowUpRight size={12} aria-hidden />
          ) : ratio < 0 ? (
            <ArrowDownRight size={12} aria-hidden />
          ) : null}
          {t('admin.metric.vsPrevious', { change: percent })}
        </span>
      );
    }
  }
  return (
    <div className={`dt-card gap-1 p-3 ${emphasis ? 'border-brand' : ''}`}>
      <span className="dt-label">{label}</span>
      <span className="text-title">{value}</span>
      {change}
      {note ? <span className="dt-cap">{note}</span> : null}
    </div>
  );
}

/** « < 10 » for suppressed analytics cells. */
export function useCellText() {
  const { t, locale } = useI18n();
  return (value: number | null | undefined) =>
    value === null || value === undefined
      ? t('admin.analytics.suppressed')
      : new Intl.NumberFormat(locale).format(value);
}
