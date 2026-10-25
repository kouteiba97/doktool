'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, call } from '@/api/client';
import { formatDate } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { TextInput } from '@/ui/field';
import { DocumentDrawer } from './document-drawer';
import {
  type DocumentStatus,
  type DocumentType,
  libraryKey,
  type ReferenceDocument,
  SEGMENT_OF,
  STATUS_FILTERS,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
} from './labels';
import { UploadDrawer } from './upload-drawer';

/** The two library types, in tab order. */
const TYPES: DocumentType[] = ['ORDONNANCE', 'CERTIFICATE'];

/** « Bibliothèque de référence » (ScreenReferenceLibraryAdmin): one surface, type switch on top. */
export function LibraryPage({ type }: { type: DocumentType }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const { has } = useGrants();
  const [status, setStatus] = useState<DocumentStatus | null>(null);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Every model of this type (archived ones included; the status chips filter them).
  const list = useQuery({
    queryKey: libraryKey(type),
    queryFn: () => call(api.GET('/admin/v1/reference-documents', { params: { query: { type } } })),
  });

  // The rows shown: filtered by status chip and by the search text, in the browser.
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    return (list.data ?? []).filter(
      (row) =>
        (status === null || row.status === status) &&
        (!needle ||
          row.titleFr.toLocaleLowerCase(locale).includes(needle) ||
          (row.titleEn ?? '').toLocaleLowerCase(locale).includes(needle)),
    );
  }, [list.data, status, search, locale]);

  // How many models each status chip has.
  const counts = useMemo(() => {
    const byStatus = new Map<DocumentStatus | null, number>([[null, list.data?.length ?? 0]]);
    for (const row of list.data ?? [])
      byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    return byStatus;
  }, [list.data]);

  // The table's columns.
  const columns = useMemo<Column<ReferenceDocument>[]>(
    () => [
      {
        id: 'title',
        header: t('admin.library.colTitle'),
        cell: (row) => (
          <div className="min-w-0">
            <b>{row.titleFr}</b>
            {row.titleEn ? <div className="dt-cap">{row.titleEn}</div> : null}
          </div>
        ),
        sortValue: (row) => row.titleFr.toLocaleLowerCase(locale),
      },
      {
        id: 'demo',
        header: t('admin.library.colDemo'),
        cell: (row) =>
          row.demoSample ? <Badge tone="teal">{t('admin.library.demo')}</Badge> : '—',
        hideable: true,
      },
      {
        id: 'status',
        header: t('admin.library.colStatus'),
        cell: (row) => (
          <Badge tone={STATUS_TONES[row.status]}>{t(STATUS_LABELS[row.status])}</Badge>
        ),
        sortValue: (row) => row.status,
      },
      {
        id: 'version',
        header: t('admin.library.colVersion'),
        cell: (row) => (row.currentFile ? `v${row.currentFile.version}` : '—'),
        align: 'end',
        hideable: true,
      },
      {
        id: 'updated',
        header: t('admin.library.colUpdated'),
        cell: (row) => (
          <span>
            {formatDate(locale, row.updatedAt)}{' '}
            <span className="dt-cap">· {row.updatedBy.fullName}</span>
          </span>
        ),
        sortValue: (row) => row.updatedAt,
      },
    ],
    [t, locale],
  );

  return (
    <>
      <PageHeader
        title={t('admin.library.title')}
        caption={t('admin.library.caption')}
        actions={
          has('library.write') ? (
            // « Ajouter un modèle »: opens the upload drawer.
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden />
              {t('admin.library.add')}
            </Button>
          ) : null
        }
      />
      <div className="dt-tabs" role="tablist" aria-label={t('admin.library.title')}>
        {TYPES.map((value) => (
          // Type tab: Ordonnances or Certificats (each has its own address).
          <Link
            key={value}
            href={`/admin/library/${SEGMENT_OF[value]}`}
            role="tab"
            aria-selected={value === type}
          >
            {t(TYPE_LABELS[value])}
          </Link>
        ))}
      </div>
      {list.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(list.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t(TYPE_LABELS[type])}
          columns={columns}
          rows={rows}
          rowId={(row) => row.id}
          loading={list.isPending}
          selectedId={openId}
          onOpen={(row) => setOpenId(row.id)}
          toolbar={
            <>
              {STATUS_FILTERS.map((value) => (
                // Status chip with its count: filters the table.
                <button
                  key={value ?? 'all'}
                  type="button"
                  className="dt-chip"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {value ? t(STATUS_LABELS[value]) : t('admin.library.allStatuses')}
                  <span className="dt-cap">{counts.get(value) ?? 0}</span>
                </button>
              ))}
              <div className="w-sidebar">
                <TextInput
                  type="search"
                  aria-label={t('admin.library.search')}
                  placeholder={t('admin.library.search')}
                  value={search}
                  unit={<Search size={14} aria-hidden />}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </>
          }
        />
      )}
      <DocumentDrawer documentId={openId} onClose={() => setOpenId(null)} />
      {adding ? (
        <UploadDrawer
          type={type}
          open
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            setOpenId(id);
          }}
        />
      ) : null}
    </>
  );
}
