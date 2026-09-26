'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { useToast } from '@/ui/toast';
import { CalculatorFormDialog } from './calculator-form-dialog';
import {
  ACCESS_LABELS,
  type Calculator,
  CALCULATOR_STATUS_LABELS,
  calculatorsKey,
  openDraft,
  publishedVersion,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_TONES,
} from './labels';

/** « Calculateurs » (ScreenCalculatorAdmin list): row → full-width detail page. */
export function CalculatorsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: calculatorsKey,
    queryFn: () => call(api.GET('/admin/v1/calculators')),
  });

  const columns = useMemo<Column<Calculator>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.calculators.colName'),
        cell: (row) => (
          <div>
            <b>{locale === 'en' ? row.nameEn : row.nameFr}</b>
            <div className="dt-mono dt-cap">{row.slug}</div>
          </div>
        ),
        sortValue: (row) => (locale === 'en' ? row.nameEn : row.nameFr).toLocaleLowerCase(locale),
      },
      {
        id: 'category',
        header: t('admin.calculators.colCategory'),
        cell: (row) => row.category ?? '—',
        sortValue: (row) => row.category ?? null,
        hideable: true,
      },
      {
        id: 'access',
        header: t('admin.calculators.colAccess'),
        cell: (row) => (
          <span className="dt-row-flex">
            {t(ACCESS_LABELS[row.accessTier])}
            {row.demoSample ? <Badge tone="teal">{t('admin.library.demo')}</Badge> : null}
          </span>
        ),
      },
      {
        id: 'published',
        header: t('admin.calculators.colPublished'),
        cell: (row) => {
          const published = publishedVersion(row);
          const draft = openDraft(row);
          return (
            <span className="dt-row-flex">
              {published ? `v${published.version}` : '—'}
              {draft ? (
                <Badge tone={VERSION_STATUS_TONES[draft.status]}>
                  v{draft.version} · {t(VERSION_STATUS_LABELS[draft.status])}
                </Badge>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'source',
        header: t('admin.calculators.colSource'),
        hideable: true,
        cell: (row) => {
          const primary = publishedVersion(row)?.sources.find(
            (source) => source.role === 'PRIMARY',
          );
          return primary ? `${primary.authors} (${primary.year})` : '—';
        },
      },
      {
        id: 'reviewed',
        header: t('admin.calculators.colReviewed'),
        hideable: true,
        cell: (row) => {
          const reviewed = publishedVersion(row)?.reviewedAt;
          return reviewed ? formatDate(locale, reviewed) : '—';
        },
        sortValue: (row) => publishedVersion(row)?.reviewedAt ?? null,
      },
      {
        id: 'status',
        header: t('admin.calculators.colStatus'),
        cell: (row) => (
          <Badge tone={row.status === 'ACTIVE' ? 'success' : 'outline'}>
            {t(CALCULATOR_STATUS_LABELS[row.status])}
          </Badge>
        ),
      },
    ],
    [t, locale],
  );

  return (
    <>
      <PageHeader
        title={t('admin.calculators.title')}
        caption={t('admin.calculators.caption')}
        actions={
          has('calculators.draft') ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden />
              {t('admin.calculators.add')}
            </Button>
          ) : null
        }
      />
      {list.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(list.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.calculators.title')}
          columns={columns}
          rows={list.data ?? []}
          rowId={(row) => row.id}
          loading={list.isPending}
          onOpen={(row) => router.push(`/admin/calculators/${row.id}`)}
        />
      )}
      <CalculatorFormDialog
        calculator={null}
        open={creating}
        onOpenChange={setCreating}
        onSaved={(created) => {
          void queryClient.invalidateQueries({ queryKey: calculatorsKey });
          toast(t('admin.calculators.created'));
          router.push(`/admin/calculators/${created.id}`);
        }}
      />
    </>
  );
}
