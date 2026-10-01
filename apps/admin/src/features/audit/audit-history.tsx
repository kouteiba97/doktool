'use client';

import type { Schemas } from '@/api/client';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { actionLabel } from './audit-labels';

type Entry = Pick<Schemas['AuditEntryDto'], 'id' | 'action' | 'occurredAt' | 'reason'> & {
  actorName?: string | null;
};

/** The « Historique » tab of a drawer: who did what, when, and why. */
export function AuditHistory({ entries }: { entries: Entry[] }) {
  const { t, locale } = useI18n();
  if (entries.length === 0) return <p className="dt-cap">{t('admin.audit.noHistory')}</p>;
  return (
    <ol className="dt-stack gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className="dt-stack gap-0">
          <span>{actionLabel(t, entry.action)}</span>
          <span className="dt-cap">
            {entry.actorName ? `${entry.actorName} · ` : ''}
            {formatDateTime(locale, entry.occurredAt)}
            {entry.reason ? ` · ${entry.reason}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}
