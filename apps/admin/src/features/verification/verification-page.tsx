'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { CaseDrawer } from './case-drawer';
import { queueKey } from './keys';
import {
  personName,
  PROFESSIONAL_TYPE_LABELS,
  QUEUE_TAB_LABELS,
  QUEUE_TABS,
  type QueueTab,
  queueStatus,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  VERIFICATION_SLA_HOURS,
  type VerificationType,
  waitingSince,
} from './labels';
import { SlaBadge } from './sla-badge';

/** One row of the review queue. */
type QueueItem = Schemas['AdminVerificationQueueItemDto'];

/** The API returns 50 cases per page, oldest first. */
const PAGE_SIZE = 50;
const TYPES: VerificationType[] = ['IDENTITY', 'PROFESSIONAL_STATUS', 'STUDENT_STATUS'];

/** « Vérification » (ScreenVerificationCenter): queue by status, oldest first, row → drawer. */
export function VerificationPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [tab, setTab] = useState<QueueTab>('PENDING');
  const [type, setType] = useState<VerificationType | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Pages of cases for the selected tab and type, oldest first.
  const queue = useInfiniteQuery({
    queryKey: [...queueKey, tab, type],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(
        api.GET('/admin/v1/verification/cases', {
          params: {
            query: {
              status: queueStatus(tab),
              type: type ?? undefined,
              cursor: pageParam,
            },
          },
        }),
      ),
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last.at(-1)?.id : undefined),
  });
  const rows = useMemo(() => queue.data?.pages.flat() ?? [], [queue.data]);
  // Only cases still waiting get the SLA warning.
  const waiting = tab === 'PENDING' || tab === 'APPEALED';

  // The queue's columns.
  const columns = useMemo<Column<QueueItem>[]>(
    () => [
      {
        id: 'person',
        header: t('admin.verification.colPerson'),
        cell: (row) => <b>{personName(row.user)}</b>,
        sortValue: (row) => personName(row.user).toLocaleLowerCase(locale),
      },
      {
        id: 'type',
        header: t('admin.verification.colType'),
        cell: (row) => (
          <span className="dt-row-flex">
            {t(TYPE_LABELS[row.type])}
            {row.professionalType && row.type !== 'IDENTITY' ? (
              <span className="dt-cap">{t(PROFESSIONAL_TYPE_LABELS[row.professionalType])}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'affiliation',
        header: t('admin.verification.colAffiliation'),
        hideable: true,
        cell: (row) =>
          row.specialty
            ? row.specialty[locale]
            : row.university
              ? row.academicYear
                ? t('admin.verification.universityYear', {
                    university: row.university,
                    year: row.academicYear,
                  })
                : row.university
              : '—',
      },
      {
        id: 'submitted',
        header: t('admin.verification.colSubmitted'),
        cell: (row) => <SlaBadge since={waitingSince(row)} waiting={waiting} />,
        sortValue: (row) => waitingSince(row) ?? '',
      },
      {
        id: 'reviewer',
        header: t('admin.verification.colReviewer'),
        hideable: true,
        cell: (row) => row.reviewer?.fullName ?? '—',
      },
      {
        id: 'status',
        header: t('admin.verification.colStatus'),
        cell: (row) => (
          <Badge tone={STATUS_TONES[row.status]}>{t(STATUS_LABELS[row.status])}</Badge>
        ),
      },
    ],
    [t, locale, waiting],
  );

  return (
    <>
      <PageHeader
        title={t('admin.verification.title')}
        caption={t('admin.verification.slaCaption', { hours: VERIFICATION_SLA_HOURS })}
      />
      <div className="dt-tabs" role="tablist" aria-label={t('admin.verification.title')}>
        {QUEUE_TABS.map((value) => (
          // Queue tab (En attente, Vérifiés, Rejetés, Expirés, Appels).
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {t(QUEUE_TAB_LABELS[value])}
          </button>
        ))}
      </div>
      {queue.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(queue.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.verification.title')}
          columns={columns}
          rows={rows}
          rowId={(row) => row.id}
          loading={queue.isPending}
          selectedId={openId}
          onOpen={(row) => setOpenId(row.id)}
          toolbar={
            <>
              {/* Type filter chip « Tous ». */}
              <button
                type="button"
                className="dt-chip"
                aria-pressed={type === null}
                onClick={() => setType(null)}
              >
                {t('admin.verification.allTypes')}
              </button>
              {TYPES.map((value) => (
                // Type filter chip: identity, professional status or student status.
                <button
                  key={value}
                  type="button"
                  className="dt-chip"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {t(TYPE_LABELS[value])}
                </button>
              ))}
            </>
          }
        />
      )}
      {queue.hasNextPage ? (
        <div>
          {/* « Charger plus »: the next 50 cases. */}
          <Button
            size="sm"
            busy={queue.isFetchingNextPage}
            onClick={() => void queue.fetchNextPage()}
          >
            {t('admin.table.loadMore')}
          </Button>
        </div>
      ) : null}
      <CaseDrawer caseId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
