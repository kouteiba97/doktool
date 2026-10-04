'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, call } from '@/api/client';
import { formatDate, formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { ReasonDialog } from '@/ui/reason-dialog';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import { SourceDialog, SubstanceDialog } from './dialogs';
import {
  type ClinicalSource,
  type ContentReport,
  REPORT_REASON_LABELS,
  reportsKey,
  SECTION_LABELS,
  SOURCE_TYPE_LABELS,
  sourcesKey,
  type Substance,
  substancesKey,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_TONES,
} from './labels';

/** « Grossesse · Allaitement » (ADR-019): substances, the sources registry and user reports. */
export function PregnancyPage() {
  const { t } = useI18n();
  const { has } = useGrants();
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  return (
    <>
      <PageHeader
        title={t('admin.pregnancy.title')}
        caption={t('admin.pregnancy.caption')}
        actions={
          has('pregnancy.draft') ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden />
              {t('admin.pregnancy.addSubstance')}
            </Button>
          ) : null
        }
      />
      <Tabs defaultValue="substances" className="dt-stack">
        <TabList label={t('admin.pregnancy.title')}>
          <Tab value="substances">{t('admin.pregnancy.tabSubstances')}</Tab>
          <Tab value="sources">{t('admin.pregnancy.tabRegistry')}</Tab>
          <Tab value="reports">{t('admin.pregnancy.tabReports')}</Tab>
        </TabList>
        <TabPanel value="substances">
          <SubstancesTable />
        </TabPanel>
        <TabPanel value="sources">
          <SourcesTable />
        </TabPanel>
        <TabPanel value="reports">
          <ReportsTable />
        </TabPanel>
      </Tabs>
      {creating ? (
        <SubstanceDialog
          substance={null}
          open
          onOpenChange={setCreating}
          onSaved={(created) => {
            void queryClient.invalidateQueries({ queryKey: substancesKey });
            toast(t('admin.pregnancy.substanceCreated'));
            router.push(`/admin/pregnancy/${created.id}`);
          }}
        />
      ) : null}
    </>
  );
}

function SubstancesTable() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const router = useRouter();
  const list = useQuery({
    queryKey: substancesKey,
    queryFn: () => call(api.GET('/admin/v1/pregnancy/substances')),
  });
  const columns = useMemo<Column<Substance>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.pregnancy.colName'),
        cell: (row) => (
          <div>
            <b>{locale === 'en' && row.nameEn ? row.nameEn : row.nameFr}</b>
            {row.atcCode ? <div className="dt-mono dt-cap">{row.atcCode}</div> : null}
          </div>
        ),
        sortValue: (row) => row.nameFr.toLocaleLowerCase(locale),
      },
      {
        id: 'published',
        header: t('admin.pregnancy.colPublished'),
        cell: (row) => (
          <span className="dt-row-flex">
            {row.published ? `v${row.published.version}` : '—'}
            {row.open ? (
              <Badge tone={VERSION_STATUS_TONES[row.open.status]}>
                v{row.open.version} · {t(VERSION_STATUS_LABELS[row.open.status])}
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: 'visibility',
        header: t('admin.pregnancy.colVisibility'),
        cell: (row) => (
          <span className="dt-row-flex">
            <Badge tone={row.enabled ? 'success' : 'outline'}>
              {row.enabled ? t('admin.pregnancy.enabled') : t('admin.pregnancy.disabled')}
            </Badge>
            {row.demoSample ? <Badge tone="teal">{t('admin.library.demo')}</Badge> : null}
          </span>
        ),
      },
      {
        id: 'reports',
        header: t('admin.pregnancy.colReports'),
        align: 'end',
        cell: (row) =>
          row.openReports > 0 ? <Badge tone="warning">{row.openReports}</Badge> : '—',
        sortValue: (row) => row.openReports,
      },
      {
        id: 'updated',
        header: t('admin.pregnancy.colUpdated'),
        hideable: true,
        cell: (row) => formatDate(locale, row.updatedAt),
        sortValue: (row) => row.updatedAt,
      },
    ],
    [t, locale],
  );
  if (list.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(list.error)}
      </EmptyState>
    );
  }
  return (
    <DataTable
      label={t('admin.pregnancy.tabSubstances')}
      columns={columns}
      rows={list.data ?? []}
      rowId={(row) => row.id}
      loading={list.isPending}
      onOpen={(row) => router.push(`/admin/pregnancy/${row.id}`)}
    />
  );
}

function SourcesTable() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const [editing, setEditing] = useState<ClinicalSource | 'new' | null>(null);
  const list = useQuery({
    queryKey: sourcesKey,
    queryFn: () => call(api.GET('/admin/v1/pregnancy/sources')),
  });
  const columns = useMemo<Column<ClinicalSource>[]>(
    () => [
      { id: 'title', header: t('admin.pregnancy.sourceTitle'), cell: (row) => <b>{row.title}</b> },
      {
        id: 'type',
        header: t('admin.pregnancy.sourceType'),
        cell: (row) => t(SOURCE_TYPE_LABELS[row.type]),
      },
      {
        id: 'publisher',
        header: t('admin.pregnancy.sourcePublisher'),
        cell: (row) => row.publisher ?? '—',
      },
      {
        id: 'edition',
        header: t('admin.pregnancy.sourceEdition'),
        cell: (row) => [row.edition, row.year].filter(Boolean).join(' · ') || '—',
      },
      {
        id: 'edit',
        header: '',
        align: 'end',
        cell: (row) =>
          has('pregnancy.draft') ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
              <Pencil size={14} aria-hidden />
              {t('admin.common.edit')}
            </Button>
          ) : null,
      },
    ],
    [t, has],
  );
  if (list.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(list.error)}
      </EmptyState>
    );
  }
  return (
    <div className="dt-stack">
      <DataTable
        label={t('admin.pregnancy.tabRegistry')}
        columns={columns}
        rows={list.data ?? []}
        rowId={(row) => row.id}
        loading={list.isPending}
        toolbar={
          has('pregnancy.draft') ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus size={14} aria-hidden />
              {t('admin.pregnancy.addSource')}
            </Button>
          ) : null
        }
      />
      {editing ? (
        <SourceDialog
          source={editing === 'new' ? null : editing}
          open
          onOpenChange={(open) => (open ? undefined : setEditing(null))}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: sourcesKey });
            toast(t('admin.pregnancy.sourceSaved'));
          }}
        />
      ) : null}
    </div>
  );
}

function ReportsTable() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { has } = useGrants();
  const [resolving, setResolving] = useState<ContentReport | null>(null);
  const list = useQuery({
    queryKey: reportsKey,
    queryFn: () =>
      call(api.GET('/admin/v1/pregnancy/reports', { params: { query: { status: 'open' } } })),
  });
  const columns = useMemo<Column<ContentReport>[]>(
    () => [
      {
        id: 'date',
        header: t('admin.pregnancy.colReported'),
        cell: (row) => <span className="nw">{formatDateTime(locale, row.createdAt)}</span>,
      },
      {
        id: 'substance',
        header: t('admin.pregnancy.colName'),
        cell: (row) => (
          <span>
            <b>{row.substance.nameFr}</b>
            {row.version ? <span className="dt-mono dt-cap"> v{row.version}</span> : null}
          </span>
        ),
      },
      {
        id: 'section',
        header: t('admin.pregnancy.colSection'),
        cell: (row) => t(SECTION_LABELS[row.section]),
      },
      {
        id: 'reason',
        header: t('admin.pregnancy.colReason'),
        cell: (row) => t(REPORT_REASON_LABELS[row.reason]),
      },
      { id: 'comment', header: t('admin.pregnancy.colComment'), cell: (row) => row.comment ?? '—' },
      {
        id: 'resolve',
        header: '',
        align: 'end',
        cell: (row) =>
          has('pregnancy.draft') ? (
            <Button size="sm" onClick={() => setResolving(row)}>
              {t('admin.pregnancy.resolve')}
            </Button>
          ) : null,
      },
    ],
    [t, locale, has],
  );
  if (list.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(list.error)}
      </EmptyState>
    );
  }
  return (
    <>
      <DataTable
        label={t('admin.pregnancy.tabReports')}
        columns={columns}
        rows={list.data ?? []}
        rowId={(row) => row.id}
        loading={list.isPending}
        onOpen={(row) => router.push(`/admin/pregnancy/${row.substance.id}`)}
      />
      <ReasonDialog
        open={resolving !== null}
        onOpenChange={(open) => (open ? undefined : setResolving(null))}
        title={t('admin.pregnancy.resolveTitle')}
        description={resolving?.comment ?? undefined}
        confirmLabel={t('admin.pregnancy.resolve')}
        onConfirm={async (resolution) => {
          await call(
            api.POST('/admin/v1/pregnancy/reports/{id}/resolve', {
              params: { path: { id: resolving!.id } },
              body: { resolution },
            }),
          );
          await queryClient.invalidateQueries({ queryKey: reportsKey });
          void queryClient.invalidateQueries({ queryKey: substancesKey });
          toast(t('admin.pregnancy.resolved'));
        }}
      />
    </>
  );
}
