'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, call } from '@/api/client';
import type { paths } from '@/api/schema';
import { formatDate, formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { Select, TextInput } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import { useDebounced } from '@/ui/use-debounced';
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
          <>
            {/* « Importer un fichier » (or the import history without the draft grant). */}
            <Link href="/admin/pregnancy/import" className="dt-btn secondary">
              <FileSpreadsheet size={16} aria-hidden />
              {has('pregnancy.draft')
                ? t('admin.pregnancyImport.open')
                : t('admin.pregnancyImport.history')}
            </Link>
            {has('pregnancy.draft') ? (
              // « Ajouter une substance ».
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden />
                {t('admin.pregnancy.addSubstance')}
              </Button>
            ) : null}
          </>
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

/** Filters of the substances table, as the API names them. */
type SubstanceQuery = NonNullable<
  paths['/admin/v1/pregnancy/substances']['get']['parameters']['query']
>;

/** Profile states offered by the state filter. */
const STATES = ['PUBLISHED', 'DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'NONE'] as const;
/** Periods offered by the period filter. */
const TARGETS = ['T1', 'T2', 'T3', 'PERIPARTUM', 'LACTATION'] as const;
const TARGET_LABELS = {
  T1: 'admin.pregnancy.periodT1',
  T2: 'admin.pregnancy.periodT2',
  T3: 'admin.pregnancy.periodT3',
  PERIPARTUM: 'admin.pregnancy.periodPeripartum',
  LACTATION: 'admin.pregnancy.sectionLactation',
} as const;

/** « Substances » tab: search and filters, and approving every version shown in review at once. */
function SubstancesTable() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const router = useRouter();
  const { has } = useGrants();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState<SubstanceQuery>({});
  const [approving, setApproving] = useState(false);
  // Typing in the search box asks the server once the text settles, not at every key.
  const requested = useDebounced(query);
  const list = useQuery({
    queryKey: [...substancesKey, requested],
    queryFn: () =>
      call(api.GET('/admin/v1/pregnancy/substances', { params: { query: requested } })),
    placeholderData: (previous) => previous,
  });
  // Changes one filter; empty values are dropped, and the conduct filter needs a period.
  const set = (patch: Partial<SubstanceQuery>) => {
    const next = { ...query, ...patch };
    for (const key of Object.keys(next) as (keyof SubstanceQuery)[]) {
      if (next[key] === '' || next[key] === undefined) delete next[key];
    }
    if (!next.period) delete next.conduct;
    setQuery(next);
  };
  // Versions currently shown that wait for review (bulk approval).
  const inReview = (list.data ?? []).filter((row) => row.open?.status === 'IN_REVIEW');
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
            {row.mergedInto ? (
              <Badge tone="outline">
                {t('admin.pregnancyMerge.badge', { name: row.mergedInto.nameFr })}
              </Badge>
            ) : (
              <Badge tone={row.enabled ? 'success' : 'outline'}>
                {row.enabled ? t('admin.pregnancy.enabled') : t('admin.pregnancy.disabled')}
              </Badge>
            )}
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
  // Search box, filters and the bulk-approve button above the table.
  const toolbar = (
    <div className="dt-row-flex flex-wrap gap-2">
      <TextInput
        aria-label={t('admin.pregnancy.filterSearch')}
        placeholder={t('admin.pregnancy.filterSearch')}
        value={query.q ?? ''}
        onChange={(event) => set({ q: event.target.value })}
      />
      <Select
        aria-label={t('admin.pregnancy.filterState')}
        value={query.state ?? ''}
        onChange={(event) =>
          set({ state: (event.target.value || undefined) as SubstanceQuery['state'] })
        }
      >
        <option value="">{t('admin.pregnancy.filterAllStates')}</option>
        {STATES.map((state) => (
          <option key={state} value={state}>
            {state === 'NONE'
              ? t('admin.pregnancy.filterNoProfile')
              : t(VERSION_STATUS_LABELS[state])}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t('admin.pregnancy.filterArchived')}
        value={query.archived ?? 'all'}
        onChange={(event) => set({ archived: event.target.value as SubstanceQuery['archived'] })}
      >
        <option value="all">{t('admin.pregnancy.filterAllSubstances')}</option>
        <option value="active">{t('admin.pregnancy.enabled')}</option>
        <option value="archived">{t('admin.pregnancy.disabled')}</option>
      </Select>
      <Select
        aria-label={t('admin.pregnancy.filterPeriod')}
        value={query.period ?? ''}
        onChange={(event) =>
          set({ period: (event.target.value || undefined) as SubstanceQuery['period'] })
        }
      >
        <option value="">{t('admin.pregnancy.filterAnyPeriod')}</option>
        {TARGETS.map((target) => (
          <option key={target} value={target}>
            {t(TARGET_LABELS[target])}
          </option>
        ))}
      </Select>
      {query.period ? (
        <Select
          aria-label={t('admin.pregnancy.filterConduct')}
          value={query.conduct ?? ''}
          onChange={(event) =>
            set({ conduct: (event.target.value || undefined) as SubstanceQuery['conduct'] })
          }
        >
          <option value="">{t('admin.pregnancy.filterAnyConduct')}</option>
          <option value="CONTRAINDICATED">{t('admin.pregnancy.conductContraindicated')}</option>
          <option value="AVOID">{t('admin.pregnancy.conductAvoid')}</option>
          <option value="OCCASIONAL_USE">{t('admin.pregnancy.conductOccasional')}</option>
          <option value="NONE">{t('admin.pregnancyImport.noBadge')}</option>
        </Select>
      ) : null}
      {has('pregnancy.review') && query.state === 'IN_REVIEW' && inReview.length > 0 ? (
        // « Approuver les N affichées »: approves every version in review shown, with one reason.
        <Button variant="primary" onClick={() => setApproving(true)}>
          {t('admin.pregnancy.approveShown', { count: inReview.length })}
        </Button>
      ) : null}
    </div>
  );
  return (
    <>
      <DataTable
        label={t('admin.pregnancy.tabSubstances')}
        columns={columns}
        rows={list.data ?? []}
        rowId={(row) => row.id}
        loading={list.isPending}
        toolbar={toolbar}
        onOpen={(row) => router.push(`/admin/pregnancy/${row.id}`)}
      />
      <ReasonDialog
        open={approving}
        onOpenChange={setApproving}
        title={t('admin.pregnancy.approveShownTitle', { count: inReview.length })}
        description={
          <span>
            {t('admin.pregnancy.approveShownHelp')}
            <br />
            {inReview.map((row) => row.nameFr).join(' · ')}
          </span>
        }
        confirmLabel={t('admin.pregnancy.approveShown', { count: inReview.length })}
        onConfirm={async (text) => {
          const response = await call(
            api.POST('/admin/v1/pregnancy/versions/approve-many', {
              body: { versionIds: inReview.map((row) => row.open!.id), text },
            }),
          );
          const refused = response.results.filter((r) => !r.ok).length;
          toast(
            t('admin.pregnancy.approvedShown', { ok: response.results.length - refused, refused }),
            refused > 0 ? 'error' : 'default',
          );
          void queryClient.invalidateQueries({ queryKey: substancesKey });
        }}
      />
    </>
  );
}

/** « Registre des sources » tab: the sources profiles cite. */
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
            // « Modifier » this source.
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
            // « Ajouter une source ».
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

/** « Signalements » tab: errors reported by users, open ones first. */
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
            // « Traiter »: closes the report with what was done (the row itself opens the
            // substance).
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
