'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { TextInput } from './field';

/** Periods of section 15: today, 7 d, 30 d, 3 months, 12 months, custom. */
export const PRESETS = ['today', '7d', '30d', '3m', '12m', 'custom'] as const;
/** One of the period presets. */
export type PeriodPreset = (typeof PRESETS)[number];

const LABELS: Record<PeriodPreset, MessageKey> = {
  today: 'admin.period.today',
  '7d': 'admin.period.days7',
  '30d': 'admin.period.days30',
  '3m': 'admin.period.months3',
  '12m': 'admin.period.months12',
  custom: 'admin.period.custom',
};

/** A period sent to the API: from (inclusive) and to (exclusive), ISO dates. */
export interface Period {
  from: string;
  to: string;
}

const DAY = 86_400_000;

/** The period ending now (tomorrow 00:00 UTC, so today is complete) for a preset. */
export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, now = new Date()): Period {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const days = { today: 1, '7d': 7, '30d': 30, '3m': 91, '12m': 365 }[preset];
  return { from: new Date(end.getTime() - days * DAY).toISOString(), to: end.toISOString() };
}

/** A custom period from two calendar days (inclusive), or null while it is incomplete or reversed. */
export function customPeriod(fromDay: string, toDay: string): Period | null {
  if (!fromDay || !toDay || toDay < fromDay) return null;
  const from = new Date(`${fromDay}T00:00:00Z`);
  const to = new Date(new Date(`${toDay}T00:00:00Z`).getTime() + DAY);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** State of a period picker: preset or custom days, and the resulting period. */
export function usePeriod(initial: Exclude<PeriodPreset, 'custom'> = '30d') {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const period = useMemo(
    () => (preset === 'custom' ? customPeriod(fromDay, toDay) : presetPeriod(preset)),
    [preset, fromDay, toDay],
  );
  return { preset, setPreset, fromDay, setFromDay, toDay, setToDay, period };
}

/** The period buttons (today, 7 d, 30 d…) and, for « Personnalisée », two date inputs. */
export function PeriodPicker({ state }: { state: ReturnType<typeof usePeriod> }) {
  const { t } = useI18n();
  return (
    <div className="dt-row-flex">
      <div className="dt-seg" role="group" aria-label={t('admin.period.label')}>
        {PRESETS.map((preset) => (
          // One preset button; aria-pressed marks the one selected.
          <button
            key={preset}
            type="button"
            aria-pressed={state.preset === preset}
            onClick={() => state.setPreset(preset)}
          >
            {t(LABELS[preset])}
          </button>
        ))}
      </div>
      {state.preset === 'custom' ? (
        <div className="flex items-center gap-2">
          <TextInput
            type="date"
            aria-label={t('admin.period.from')}
            value={state.fromDay}
            onChange={(event) => state.setFromDay(event.target.value)}
          />
          <TextInput
            type="date"
            aria-label={t('admin.period.to')}
            value={state.toDay}
            min={state.fromDay || undefined}
            onChange={(event) => state.setToDay(event.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
