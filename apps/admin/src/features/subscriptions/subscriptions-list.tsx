'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDate } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState } from '@/ui/feedback';
import { personName } from '../users/labels';
import { Select } from '@/ui/field';
import {
  PROVIDER_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
  type SubscriptionStatus,
} from './labels';

/** One subscription row. */
type Subscription = Schemas['AdminSubscriptionDto'];

const PAGE_SIZE = 50;
const STATUSES: SubscriptionStatus[] = ['ACTIVE', 'GRACE', 'CANCELED', 'EXPIRED'];

/** « Abonnements » tab: who holds which plan version, until when, last payment (section 07). */
export function SubscriptionsList() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  // Pages of subscriptions for the filters.
  const list = useInfiniteQuery({
    queryKey: ['admin', 'subscriptions', status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(
        api.GET('/admin/v1/subscriptions', {
          params: { query: { status: status || undefined, cursor: pageParam } },
        }),
      ),
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last.at(-1)?.id : undefined),
  });
  const rows = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);

  const columns = useMemo<Column<Subscription>[]>(
    () => [
      {
        id: 'user',
        header: t('admin.subscriptions.colUser'),
        cell: (row) => personName(row.user, t),
      },
      {
        id: 'plan',
        header: t('admin.subscriptions.colPlan'),
        cell: (row) => (
          <span>
            {locale === 'en' ? row.plan.nameEn : row.plan.nameFr}{' '}
            <span className="dt-mono dt-cap">
              {row.plan.code} v{row.plan.version}
            </span>
          </span>
        ),
      },
      {
        id: 'status',
        header: t('admin.subscriptions.colStatus'),
        cell: (row) => (
          <Badge tone={SUBSCRIPTION_STATUS_TONES[row.status]}>
            {t(SUBSCRIPTION_STATUS_LABELS[row.status])}
          </Badge>
        ),
      },
      {
        id: 'start',
        header: t('admin.subscriptions.colStart'),
        cell: (row) => (
          <span className="nw">
            {row.currentPeriodStart ? formatDate(locale, row.currentPeriodStart) : '—'}
          </span>
        ),
      },
      {
        id: 'end',
        header: t('admin.subscriptions.colEnd'),
        cell: (row) => (
          <span className="nw">
            {formatDate(
              locale,
              row.graceEndsAt ?? row.currentPeriodEnd ?? row.currentPeriodStart ?? '',
            )}
          </span>
        ),
      },
      {
        id: 'method',
        header: t('admin.subscriptions.colMethod'),
        hideable: true,
        cell: (row) =>
          row.lastTransaction ? t(PROVIDER_LABELS[row.lastTransaction.paymentProvider]) : '—',
      },
      {
        id: 'last',
        header: t('admin.subscriptions.colLastTransaction'),
        hideable: true,
        cell: (row) => <span className="dt-mono">{row.lastTransaction?.transactionId ?? '—'}</span>,
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
    <div className="dt-stack">
      <DataTable
        label={t('admin.plans.tabSubscriptions')}
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        loading={list.isPending}
        toolbar={
          <div className="w-sidebar">
            <Select
              aria-label={t('admin.subscriptions.colStatus')}
              value={status}
              onChange={(event) => setStatus(event.target.value as SubscriptionStatus | '')}
            >
              <option value="">{t('admin.subscriptions.allStatuses')}</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(SUBSCRIPTION_STATUS_LABELS[value])}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {list.hasNextPage ? (
        <div>
          {/* « Charger plus ». */}
          <Button
            size="sm"
            busy={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t('admin.table.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
