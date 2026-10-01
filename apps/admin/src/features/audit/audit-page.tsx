'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleAlert, Download, Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { Select, TextInput } from '@/ui/field';
import { useToast } from '@/ui/toast';
import { ACTION_GROUPS, actionLabel, hasActionLabel, isSensitiveAction } from './audit-labels';
import { downloadFile } from '@/api/download';

type Entry = Schemas['AuditEntryDto'];

const PAGE_SIZE = 50;

interface Filters {
  action: string;
  entityType: string;
  entityId: string;
  fromDay: string;
  toDay: string;
}

const EMPTY: Filters = { action: '', entityType: '', entityId: '', fromDay: '', toDay: '' };

/** The query the API takes for the current filters (dates are whole UTC days). */
export function auditQuery(filters: Filters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.action) query.action = filters.action;
  if (/^[A-Z][A-Za-z]{1,40}$/.test(filters.entityType.trim()))
    query.entityType = filters.entityType.trim();
  if (filters.entityId.trim()) query.entityId = filters.entityId.trim();
  if (filters.fromDay) query.from = new Date(`${filters.fromDay}T00:00:00Z`).toISOString();
  if (filters.toDay)
    query.to = new Date(
      new Date(`${filters.toDay}T00:00:00Z`).getTime() + 86_400_000,
    ).toISOString();
  return query;
}

/** « Journal d'audit » (ScreenAuditLogs): immutable, filterable, exported with `audit.export`. */
export function AuditPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const { has } = useGrants();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState<Entry | null>(null);
  const [exporting, setExporting] = useState(false);
  const query = useMemo(() => auditQuery(filters), [filters]);

  const log = useInfiniteQuery({
    queryKey: ['admin', 'audit', query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(api.GET('/admin/v1/audit', { params: { query: { ...query, before: pageParam } } })),
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last.at(-1)?.id : undefined),
  });
  const rows = useMemo(() => log.data?.pages.flat() ?? [], [log.data]);

  const columns = useMemo<Column<Entry>[]>(
    () => [
      {
        id: 'when',
        header: t('admin.audit.colWhen'),
        cell: (row) => <span className="nw">{formatDateTime(locale, row.occurredAt)}</span>,
      },
      {
        id: 'actor',
        header: t('admin.audit.colActor'),
        cell: (row) =>
          row.actorName ??
          (row.actorType === 'SYSTEM'
            ? t('admin.audit.actorSystem')
            : row.actorType === 'USER'
              ? t('admin.audit.actorUser')
              : '—'),
      },
      {
        id: 'action',
        header: t('admin.audit.colAction'),
        cell: (row) => (
          <span className="dt-row-flex">
            {isSensitiveAction(row.action) ? (
              <Badge tone="warning">{t('admin.audit.sensitive')}</Badge>
            ) : null}
            {hasActionLabel(row.action) ? (
              actionLabel(t, row.action)
            ) : (
              <span className="dt-mono">{row.action}</span>
            )}
          </span>
        ),
      },
      {
        id: 'entity',
        header: t('admin.audit.colEntity'),
        hideable: true,
        cell: (row) => (
          <span>
            {row.entityType}
            {row.entityId ? (
              <span className="dt-mono dt-cap"> {row.entityId.slice(0, 8)}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'reason',
        header: t('admin.audit.colReason'),
        hideable: true,
        cell: (row) => row.reason ?? '—',
      },
      {
        id: 'ip',
        header: t('admin.audit.colIp'),
        hideable: true,
        cell: (row) => <span className="dt-mono">{row.ip ?? '—'}</span>,
      },
    ],
    [t, locale],
  );

  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile(
        '/admin/v1/audit/export',
        query,
        `doktool-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (error) {
      toast(errorText(error), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('admin.audit.title')}
        caption={t('admin.audit.caption')}
        actions={
          has('audit.export') ? (
            <Button busy={exporting} onClick={() => void exportCsv()}>
              <Download size={16} aria-hidden />
              {t('admin.audit.export')}
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-5 gap-2">
        <Select
          aria-label={t('admin.audit.filterAction')}
          value={filters.action}
          onChange={(event) => set({ action: event.target.value })}
        >
          <option value="">{t('admin.audit.allActions')}</option>
          {ACTION_GROUPS.map((group) => (
            <option key={group.prefix} value={group.prefix}>
              {t(group.label)}
            </option>
          ))}
          <option value="verification.document_viewed">
            {t('admin.audit.actions.verificationDocumentViewed')}
          </option>
          <option value="finance.adjustment.">{t('admin.audit.groupAdjustments')}</option>
        </Select>
        <TextInput
          aria-label={t('admin.audit.filterEntityType')}
          placeholder={t('admin.audit.filterEntityType')}
          value={filters.entityType}
          onChange={(event) => set({ entityType: event.target.value })}
        />
        <TextInput
          aria-label={t('admin.audit.filterEntityId')}
          placeholder={t('admin.audit.filterEntityId')}
          mono
          value={filters.entityId}
          onChange={(event) => set({ entityId: event.target.value })}
        />
        <TextInput
          type="date"
          aria-label={t('admin.period.from')}
          value={filters.fromDay}
          onChange={(event) => set({ fromDay: event.target.value })}
        />
        <TextInput
          type="date"
          aria-label={t('admin.period.to')}
          value={filters.toDay}
          onChange={(event) => set({ toDay: event.target.value })}
        />
      </div>
      {log.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(log.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.audit.title')}
          columns={columns}
          rows={rows}
          rowId={(row) => row.id}
          loading={log.isPending}
          selectedId={open?.id ?? null}
          onOpen={setOpen}
        />
      )}
      {log.hasNextPage ? (
        <div>
          <Button size="sm" busy={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
            {t('admin.table.loadMore')}
          </Button>
        </div>
      ) : null}
      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        mode="inspect"
        title={open ? actionLabel(t, open.action) : ''}
        caption={open ? formatDateTime(locale, open.occurredAt) : null}
      >
        {open ? (
          <div className="dt-stack gap-4">
            <dl className="dt-dl">
              <dt>{t('admin.audit.colActor')}</dt>
              <dd>{open.actorName ?? open.actorType}</dd>
              <dt>{t('admin.audit.colAction')}</dt>
              <dd className="dt-mono">{open.action}</dd>
              <dt>{t('admin.audit.colEntity')}</dt>
              <dd>
                {open.entityType} <span className="dt-mono">{open.entityId ?? ''}</span>
              </dd>
              <dt>{t('admin.audit.colReason')}</dt>
              <dd>{open.reason ?? '—'}</dd>
              <dt>{t('admin.audit.colIp')}</dt>
              <dd className="dt-mono">{open.ip ?? '—'}</dd>
            </dl>
            <section className="dt-stack">
              <h3 className="dt-label inline-flex items-center gap-1">
                <Eye size={14} aria-hidden />
                {t('admin.audit.before')}
              </h3>
              <pre className="dt-code">
                {open.before === null || open.before === undefined
                  ? '—'
                  : JSON.stringify(open.before, null, 2)}
              </pre>
              <h3 className="dt-label">{t('admin.audit.after')}</h3>
              <pre className="dt-code">
                {open.after === null || open.after === undefined
                  ? '—'
                  : JSON.stringify(open.after, null, 2)}
              </pre>
            </section>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
