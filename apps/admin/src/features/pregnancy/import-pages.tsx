'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Send, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { api, call } from '@/api/client';
import { formatBytes, formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, PageHeader, Skeleton } from '@/ui/feedback';
import { Field, Select, Switch, TextInput } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { Tab, TabList, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import {
  type Field as ImportField,
  FIELD_LABELS,
  FIELDS,
  FILTER_LABELS,
  FILTERS,
  type ImportIssue,
  importKey,
  type ImportListItem,
  type ImportPreview,
  type ImportRow,
  importsKey,
  issueKey,
  type RowFilter,
  rowState,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  STATUS_LABELS,
  STATUS_TARGET_LABELS,
  STATUS_TARGETS,
  STATUS_TONES,
  type StatusTarget,
} from './import-labels';
import { substancesKey } from './labels';

const PAGE = 50;

// ─────────────────────────────── history + upload ───────────────────────────────

/** « Importer un fichier » (ADR-025): the history of imports and the upload. */
export function ImportsPage() {
  const { t, locale } = useI18n();
  const { has } = useGrants();
  const router = useRouter();
  const errorText = useErrorText();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const list = useQuery({
    queryKey: importsKey,
    queryFn: () =>
      call(api.GET('/admin/v1/pregnancy/imports', { params: { query: { limit: 100 } } })),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return call(
        api.POST('/admin/v1/pregnancy/imports', {
          body: form as never,
          bodySerializer: (body) => body as unknown as FormData,
        }),
      );
    },
    onSuccess: (preview) => router.push(`/admin/pregnancy/import/${preview.id}`),
    onError: (error) => toast(errorText(error), 'error'),
  });
  const columns = useMemo<Column<ImportListItem>[]>(
    () => [
      {
        id: 'file',
        header: t('admin.pregnancyImport.colFile'),
        cell: (row) => (
          <div>
            <b>{row.fileName}</b>
            <div className="dt-cap">
              {row.sheetName} · {formatBytes(locale, row.fileBytes)}
            </div>
          </div>
        ),
      },
      {
        id: 'status',
        header: t('admin.pregnancyImport.colStatus'),
        cell: (row) => (
          <Badge tone={STATUS_TONES[row.status]}>{t(STATUS_LABELS[row.status])}</Badge>
        ),
      },
      {
        id: 'rows',
        header: t('admin.pregnancyImport.colRows'),
        align: 'end',
        cell: (row) => row.rows,
      },
      {
        id: 'by',
        header: t('admin.pregnancyImport.colBy'),
        cell: (row) => row.uploadedBy.fullName,
      },
      {
        id: 'at',
        header: t('admin.pregnancyImport.colAt'),
        cell: (row) => formatDateTime(locale, row.createdAt),
        sortValue: (row) => row.createdAt,
      },
    ],
    [t, locale],
  );
  return (
    <div className="dt-stack">
      <PageHeader
        title={t('admin.pregnancyImport.title')}
        caption={t('admin.pregnancyImport.caption')}
        actions={
          has('pregnancy.draft') ? (
            <>
              <input
                ref={input}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label={t('admin.pregnancyImport.choose')}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) upload.mutate(file);
                }}
              />
              <Button
                variant="primary"
                disabled={upload.isPending}
                onClick={() => input.current?.click()}
              >
                <Upload size={16} aria-hidden />
                {upload.isPending
                  ? t('admin.pregnancyImport.reading')
                  : t('admin.pregnancyImport.choose')}
              </Button>
            </>
          ) : null
        }
      />
      <Alert tone="info" title={t('admin.pregnancyImport.howTitle')}>
        {t('admin.pregnancyImport.howBody')}
      </Alert>
      {list.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(list.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.pregnancyImport.title')}
          columns={columns}
          rows={list.data?.items ?? []}
          rowId={(row) => row.id}
          loading={list.isPending}
          empty={
            <EmptyState icon={FileSpreadsheet} title={t('admin.pregnancyImport.emptyTitle')}>
              {t('admin.pregnancyImport.emptyBody')}
            </EmptyState>
          }
          onOpen={(row) => router.push(`/admin/pregnancy/import/${row.id}`)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────── preview ───────────────────────────────

export function ImportPreviewPage({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const { has } = useGrants();
  const errorText = useErrorText();
  const [filter, setFilter] = useState<RowFilter>('ALL');
  const [offset, setOffset] = useState(0);
  const preview = useQuery({
    queryKey: [...importKey(id), filter, offset],
    // Changing the filter or the page keeps the screen in place while the rows load.
    placeholderData: keepPreviousData,
    queryFn: () =>
      call(
        api.GET('/admin/v1/pregnancy/imports/{id}', {
          params: { path: { id }, query: { filter, limit: PAGE, offset } },
        }),
      ),
  });
  if (preview.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(preview.error)}
      </EmptyState>
    );
  }
  if (!preview.data) return <Skeleton lines={8} />;
  const data = preview.data;
  const editable = data.status === 'PREVIEW' && has('pregnancy.draft');
  return (
    <div className="dt-stack">
      <Link href="/admin/pregnancy/import" className="dt-cap">
        ← {t('admin.pregnancyImport.back')}
      </Link>
      <PageHeader
        title={data.fileName}
        caption={`${data.sheetName} · ${formatBytes(locale, data.fileBytes)} · ${data.uploadedBy.fullName} · ${formatDateTime(locale, data.createdAt)}`}
        actions={<Badge tone={STATUS_TONES[data.status]}>{t(STATUS_LABELS[data.status])}</Badge>}
      />
      {data.otherSheets.length > 0 ? (
        <Alert tone="info">
          {t('admin.pregnancyImport.otherSheets', { sheets: data.otherSheets.join(' · ') })}
        </Alert>
      ) : null}
      <Summary data={data} />
      {data.status === 'COMMITTED' ? <Committed data={data} /> : null}
      {editable ? <ColumnMapping data={data} /> : null}
      {editable || data.statuses.length > 0 ? (
        <StatusMapping data={data} editable={editable} />
      ) : null}
      <section className="dt-card p-4 dt-stack gap-3">
        <h2 className="dt-heading">{t('admin.pregnancyImport.rowsTitle')}</h2>
        <Tabs
          value={filter}
          onValueChange={(next) => {
            setFilter(next as RowFilter);
            setOffset(0);
          }}
        >
          <TabList label={t('admin.pregnancyImport.rowsTitle')}>
            {FILTERS.map((key) => (
              <Tab key={key} value={key}>
                {t(FILTER_LABELS[key])}
              </Tab>
            ))}
          </TabList>
        </Tabs>
        <RowsTable data={data} editable={editable} />
        <div className="dt-row-flex justify-between">
          <span className="dt-cap">
            {t('admin.pregnancyImport.pageOf', {
              from: data.rowsTotal === 0 ? 0 : offset + 1,
              to: Math.min(offset + PAGE, data.rowsTotal),
              total: data.rowsTotal,
            })}
          </span>
          <span className="dt-row-flex">
            <Button
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              {t('admin.pregnancyImport.previous')}
            </Button>
            <Button
              variant="secondary"
              disabled={offset + PAGE >= data.rowsTotal}
              onClick={() => setOffset(offset + PAGE)}
            >
              {t('admin.pregnancyImport.next')}
            </Button>
          </span>
        </div>
      </section>
      {editable ? <Confirm data={data} /> : null}
    </div>
  );
}

function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: importKey(id) });
}

function Summary({ data }: { data: ImportPreview }) {
  const { t } = useI18n();
  const s = data.summary;
  const items: [string, number, 'success' | 'critical' | 'warning' | 'neutral' | 'outline'][] = [
    [t('admin.pregnancyImport.sumTotal'), s.total, 'neutral'],
    [t('admin.pregnancyImport.sumValid'), s.valid, 'success'],
    [t('admin.pregnancyImport.sumErrors'), s.errors, 'critical'],
    [t('admin.pregnancyImport.sumWarnings'), s.warnings, 'warning'],
    [t('admin.pregnancyImport.sumDuplicates'), s.duplicates, 'critical'],
    [t('admin.pregnancyImport.sumConflicts'), s.conflicts, 'warning'],
    [t('admin.pregnancyImport.sumExcluded'), s.excluded, 'outline'],
    [t('admin.pregnancyImport.sumNew'), s.newSubstances, 'neutral'],
  ];
  return (
    <section className="dt-card p-4" aria-label={t('admin.pregnancyImport.summary')}>
      <div className="dt-row-flex flex-wrap gap-2">
        {items.map(([label, value, tone]) => (
          <Badge key={label} tone={value > 0 ? tone : 'outline'}>
            {label} : {value}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function ColumnMapping({ data }: { data: ImportPreview }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const refresh = useRefresh(data.id);
  const [columns, setColumns] = useState<Record<string, string>>(data.columns);
  const save = useMutation({
    mutationFn: () =>
      call(
        api.PUT('/admin/v1/pregnancy/imports/{id}/mapping', {
          params: { path: { id: data.id } },
          body: {
            revision: data.revision,
            columns: columns as Record<string, ImportField | 'ignore'>,
          },
        }),
      ),
    onSuccess: () => {
      toast(t('admin.pregnancyImport.mappingSaved'));
      void refresh();
    },
    onError: (error) => toast(errorText(error), 'error'),
  });
  const changed = JSON.stringify(columns) !== JSON.stringify(data.columns);
  return (
    <section className="dt-card p-4 dt-stack gap-3">
      <h2 className="dt-heading">{t('admin.pregnancyImport.columnsTitle')}</h2>
      {data.missingColumns.length > 0 ? (
        <Alert tone="critical" title={t('admin.pregnancyImport.missingColumns')}>
          {data.missingColumns.map((field) => t(FIELD_LABELS[field as ImportField])).join(' · ')}
        </Alert>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        {data.headers.map((header, index) => (
          <Field
            key={index}
            label={header ?? t('admin.pregnancyImport.noHeader', { n: index + 1 })}
          >
            {({ inputId }) => (
              <Select
                id={inputId}
                value={columns[String(index)] ?? 'ignore'}
                onChange={(event) =>
                  setColumns({ ...columns, [String(index)]: event.target.value })
                }
              >
                {[...FIELDS, 'ignore' as const].map((field) => (
                  <option key={field} value={field}>
                    {t(FIELD_LABELS[field])}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ))}
      </div>
      <div>
        <Button
          variant="secondary"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate()}
        >
          {t('admin.pregnancyImport.applyMapping')}
        </Button>
      </div>
    </section>
  );
}

function StatusMapping({ data, editable }: { data: ImportPreview; editable: boolean }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const refresh = useRefresh(data.id);
  const save = useMutation({
    mutationFn: (statuses: Record<string, StatusTarget>) =>
      call(
        api.PUT('/admin/v1/pregnancy/imports/{id}/mapping', {
          params: { path: { id: data.id } },
          body: { revision: data.revision, statuses },
        }),
      ),
    onSuccess: () => void refresh(),
    onError: (error) => toast(errorText(error), 'error'),
  });
  return (
    <section className="dt-card p-4 dt-stack gap-3">
      <h2 className="dt-heading">{t('admin.pregnancyImport.statusesTitle')}</h2>
      <Alert tone="warning">{t('admin.pregnancyImport.statusesHelp')}</Alert>
      {data.statuses.length === 0 ? (
        <p className="dt-cap">{t('admin.pregnancyImport.noStatuses')}</p>
      ) : (
        <table className="dt-table">
          <thead>
            <tr>
              <th>{t('admin.pregnancyImport.statusWord')}</th>
              <th>{t('admin.pregnancyImport.colRows')}</th>
              <th>{t('admin.pregnancyImport.statusConduct')}</th>
            </tr>
          </thead>
          <tbody>
            {data.statuses.map((word) => (
              <tr key={word.key}>
                <td>
                  <b>« {word.sample} »</b>
                </td>
                <td>{word.rows}</td>
                <td>
                  <Select
                    aria-label={t('admin.pregnancyImport.statusConductFor', { word: word.sample })}
                    disabled={!editable || save.isPending}
                    value={word.mappedTo ?? ''}
                    onChange={(event) =>
                      save.mutate({ [word.key]: event.target.value as StatusTarget })
                    }
                  >
                    {word.mappedTo === null ? (
                      <option value="">{t('admin.pregnancyImport.chooseConduct')}</option>
                    ) : null}
                    {STATUS_TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {t(STATUS_TARGET_LABELS[target])}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** In the table, only what needs action; the row dialog (`all`) also lists the notes. */
function IssueList({ issues, all = false }: { issues: ImportIssue[]; all?: boolean }) {
  const { t } = useI18n();
  const shown = all ? issues : issues.filter((issue) => issue.severity !== 'INFO');
  if (shown.length === 0) return <span className="dt-cap">—</span>;
  return (
    <ul className="dt-stack gap-1">
      {shown.map((issue, index) => (
        <li key={index} className="dt-row-flex">
          <Badge tone={SEVERITY_TONES[issue.severity] ?? 'neutral'}>
            {t(SEVERITY_LABELS[issue.severity] ?? 'admin.pregnancyImport.severity.info')}
          </Badge>
          <span>
            {issue.field !== 'row' ? `${t(FIELD_LABELS[issue.field as ImportField])} : ` : ''}
            {t(issueKey(issue.code), issue.params)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RowsTable({ data, editable }: { data: ImportPreview; editable: boolean }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const columns = useMemo<Column<ImportRow>[]>(
    () => [
      {
        id: 'n',
        header: t('admin.pregnancyImport.colRow'),
        cell: (row) => <span className="dt-mono">{row.rowNumber}</span>,
      },
      {
        id: 'state',
        header: t('admin.pregnancyImport.colState'),
        cell: (row) => {
          const state = rowState(row);
          return <Badge tone={state.tone}>{t(state.key)}</Badge>;
        },
      },
      {
        id: 'substance',
        header: t(FIELD_LABELS.substance),
        cell: (row: ImportRow) => {
          const known = row.issues.find(
            (issue) => issue.code === 'SUBSTANCE_EXISTING' || issue.code === 'SUBSTANCE_NEW',
          );
          return (
            <div>
              <Value row={row} field="substance" />
              {known ? (
                <div className="dt-cap">
                  {known.code === 'SUBSTANCE_NEW'
                    ? t('admin.pregnancyImport.newSubstance')
                    : t('admin.pregnancyImport.existingSubstance')}
                </div>
              ) : null}
            </div>
          );
        },
      },
      ...(['period', 'status', 'alternative'] as const).map((field) => ({
        id: field,
        header: t(FIELD_LABELS[field]),
        cell: (row: ImportRow) => <Value row={row} field={field} />,
      })),
      {
        id: 'source',
        header: t(FIELD_LABELS.sourceUrl),
        cell: (row: ImportRow) =>
          row.values.sourceUrl ? (
            <span className="dt-row-flex">
              <FieldMark row={row} field="sourceUrl" />
              <span className="dt-cap" title={row.values.sourceUrl}>
                {row.values.sourceTitle ??
                  new URL(row.values.sourceUrl, 'https://x.invalid').hostname}
              </span>
            </span>
          ) : (
            <FieldMark row={row} field="sourceUrl" />
          ),
      },
      {
        id: 'issues',
        header: t('admin.pregnancyImport.colIssues'),
        cell: (row) => <IssueList issues={row.issues} />,
      },
    ],
    [t],
  );
  return (
    <>
      <DataTable
        label={t('admin.pregnancyImport.rowsTitle')}
        columns={columns}
        rows={data.rows}
        rowId={(row) => row.id}
        empty={<p className="dt-cap p-4">{t('admin.pregnancyImport.noRows')}</p>}
        onOpen={(row) => setEditing(row)}
      />
      {editing ? (
        <RowDialog data={data} row={editing} editable={editable} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

/** Marks a cell by the worst issue of its field: an icon-free word badge, never colour alone. */
function FieldMark({ row, field }: { row: ImportRow; field: ImportField }) {
  const { t } = useI18n();
  const issues = row.issues.filter((issue) => issue.field === field && issue.severity !== 'INFO');
  if (row.excluded || issues.length === 0) return null;
  const worst = issues.some((issue) => issue.severity === 'ERROR') ? 'ERROR' : 'WARNING';
  return <Badge tone={SEVERITY_TONES[worst]!}>{t(SEVERITY_LABELS[worst]!)}</Badge>;
}

function Value({ row, field }: { row: ImportRow; field: ImportField }) {
  const value = row.values[field];
  return (
    <span className="dt-row-flex">
      <FieldMark row={row} field={field} />
      <span>{value ?? '—'}</span>
    </span>
  );
}

function RowDialog({
  data,
  row,
  editable,
  onClose,
}: {
  data: ImportPreview;
  row: ImportRow;
  editable: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const refresh = useRefresh(data.id);
  const [values, setValues] = useState(row.values);
  const [excluded, setExcluded] = useState(row.excluded);
  const [resolution, setResolution] = useState(row.resolution);
  const conflict = row.issues.some((issue) => issue.code.startsWith('CONFLICT_'));
  const originalOf = (field: ImportField) => {
    const index = Object.entries(data.columns).find(([, f]) => f === field)?.[0];
    const cell = index === undefined ? undefined : row.original[Number(index)];
    if (!cell) return null;
    return (
      [cell.text, cell.hyperlink && cell.hyperlink !== cell.text ? cell.hyperlink : null]
        .filter(Boolean)
        .join(' → ') || null
    );
  };
  const save = useMutation({
    mutationFn: () => {
      const changed = Object.fromEntries(
        FIELDS.filter((field) => (values[field] ?? null) !== (row.values[field] ?? null)).map(
          (field) => [field, values[field]?.trim() || null],
        ),
      );
      return call(
        api.PATCH('/admin/v1/pregnancy/imports/{id}/rows/{rowId}', {
          params: { path: { id: data.id, rowId: row.id } },
          body: {
            revision: data.revision,
            ...(Object.keys(changed).length ? { values: changed } : {}),
            ...(excluded !== row.excluded ? { excluded } : {}),
            ...(resolution !== row.resolution ? { resolution } : {}),
          },
        }),
      );
    },
    onSuccess: () => {
      void refresh();
      onClose();
    },
    onError: (error) => toast(errorText(error), 'error'),
  });
  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('admin.pregnancyImport.rowTitle', { n: row.rowNumber })}
      onSubmit={editable ? () => save.mutate() : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('admin.common.cancel')}
          </Button>
          {editable ? (
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {t('admin.pregnancyImport.recheck')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="dt-stack gap-3">
        <IssueList issues={row.issues} all />
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <Field
              key={field}
              label={t(FIELD_LABELS[field])}
              required={field === 'substance' || field === 'period' || field === 'status'}
              help={
                originalOf(field)
                  ? t('admin.pregnancyImport.original', { value: originalOf(field)! })
                  : undefined
              }
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  value={values[field] ?? ''}
                  disabled={!editable}
                  onChange={(event) => setValues({ ...values, [field]: event.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
        {conflict ? (
          <Field label={t('admin.pregnancyImport.conflictChoice')} required>
            {({ inputId }) => (
              <Select
                id={inputId}
                value={resolution ?? ''}
                disabled={!editable}
                onChange={(event) =>
                  setResolution((event.target.value || null) as ImportRow['resolution'])
                }
              >
                <option value="">{t('admin.pregnancyImport.chooseResolution')}</option>
                <option value="UPDATE">{t('admin.pregnancyImport.resolutionUpdate')}</option>
                <option value="SKIP">{t('admin.pregnancyImport.resolutionSkip')}</option>
              </Select>
            )}
          </Field>
        ) : null}
        <Switch
          checked={excluded}
          disabled={!editable}
          onChange={setExcluded}
          label={t('admin.pregnancyImport.exclude')}
        />
      </div>
    </Dialog>
  );
}

function Confirm({ data }: { data: ImportPreview }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const unmapped = data.statuses.some((word) => word.mappedTo === null);
  const blocked =
    data.summary.errors > 0 ||
    data.missingColumns.length > 0 ||
    unmapped ||
    data.summary.valid === 0;
  return (
    <section className="dt-card p-4 dt-row-flex justify-between">
      <span className="dt-cap">
        {blocked
          ? t('admin.pregnancyImport.blocked', { errors: data.summary.errors })
          : t('admin.pregnancyImport.ready', {
              rows: data.summary.valid,
              substances: data.summary.newSubstances,
            })}
      </span>
      <span className="dt-row-flex">
        <Button variant="ghost" onClick={() => setDiscarding(true)}>
          {t('admin.pregnancyImport.discard')}
        </Button>
        <Button variant="primary" disabled={blocked} onClick={() => setConfirming(true)}>
          {t('admin.pregnancyImport.add')}
        </Button>
      </span>
      <ReasonDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('admin.pregnancyImport.confirmTitle')}
        description={t('admin.pregnancyImport.confirmBody', {
          rows: data.summary.valid,
          excluded: data.summary.excluded,
          substances: data.summary.newSubstances,
        })}
        confirmLabel={t('admin.pregnancyImport.add')}
        onConfirm={async (reason) => {
          const result = await call(
            api.POST('/admin/v1/pregnancy/imports/{id}/commit', {
              params: { path: { id: data.id } },
              body: { revision: data.revision, reason },
            }),
          );
          toast(t('admin.pregnancyImport.committed', { versions: result.versionIds.length }));
          void queryClient.invalidateQueries({ queryKey: importKey(data.id) });
          void queryClient.invalidateQueries({ queryKey: substancesKey });
        }}
      />
      <ReasonDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={t('admin.pregnancyImport.discardTitle')}
        confirmLabel={t('admin.pregnancyImport.discard')}
        confirmVariant="danger"
        onConfirm={async (reason) => {
          await call(
            api.POST('/admin/v1/pregnancy/imports/{id}/discard', {
              params: { path: { id: data.id } },
              body: { reason },
            }),
          );
          router.push('/admin/pregnancy/import');
        }}
      />
    </section>
  );
}

function Committed({ data }: { data: ImportPreview }) {
  const { t, locale } = useI18n();
  const { has } = useGrants();
  const toast = useToast();
  const errorText = useErrorText();
  const result = data.result;
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: number; refused: number } | null>(null);
  if (!result) return null;
  return (
    <section className="dt-card p-4 dt-stack gap-3">
      <Alert tone="success" title={t('admin.pregnancyImport.doneTitle')}>
        {t('admin.pregnancyImport.doneBody', {
          substances: result.substancesCreated,
          created: result.versionsCreated,
          updated: result.versionsUpdated,
          sources: result.sourcesCreated,
          rows: result.rowsWritten,
          skipped: result.rowsSkipped,
        })}
        {data.committedAt ? ` · ${formatDateTime(locale, data.committedAt)}` : ''}
      </Alert>
      <p>{t('admin.pregnancyImport.doneNext')}</p>
      <div className="dt-row-flex">
        <Link href="/admin/pregnancy" className="dt-btn secondary">
          {t('admin.pregnancyImport.openLibrary')}
        </Link>
        {has('pregnancy.draft') && result.versionIds.length > 0 ? (
          <Button variant="primary" onClick={() => setSubmitting(true)}>
            <Send size={16} aria-hidden />
            {t('admin.pregnancyImport.submitAll')}
          </Button>
        ) : null}
      </div>
      {outcome ? (
        <Alert tone={outcome.refused > 0 ? 'info' : 'success'}>
          {t('admin.pregnancyImport.submitted', { ok: outcome.ok, refused: outcome.refused })}
        </Alert>
      ) : null}
      <ReasonDialog
        open={submitting}
        onOpenChange={setSubmitting}
        title={t('admin.pregnancyImport.submitAll')}
        description={t('admin.pregnancyImport.submitAllHelp')}
        confirmLabel={t('admin.pregnancyImport.submitAll')}
        onConfirm={async (text) => {
          try {
            const response = await call(
              api.POST('/admin/v1/pregnancy/versions/submit-many', {
                body: { versionIds: result.versionIds, text },
              }),
            );
            setOutcome({
              ok: response.results.filter((r) => r.ok).length,
              refused: response.results.filter((r) => !r.ok).length,
            });
          } catch (error) {
            toast(errorText(error), 'error');
            throw error;
          }
        }}
      />
    </section>
  );
}
