'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleAlert, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDateTime, formatMoney } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { Select, TextInput } from '@/ui/field';
import {
  type PaymentProvider,
  PROVIDER_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_STATUS_TONES,
  type TransactionStatus,
} from '../subscriptions/labels';
import { personName } from '../users/labels';
import { TransactionDrawer } from './transaction-drawer';

type Transaction = Schemas['AdminTransactionDto'];

const PAGE_SIZE = 50;
const STATUSES: TransactionStatus[] = ['SUCCEEDED', 'PENDING', 'FAILED', 'CANCELED'];
const PROVIDERS: PaymentProvider[] = ['SATIM_CIB', 'SATIM_EDAHABIA'];
export const transactionsKey = ['admin', 'transactions'] as const;

/** « Transactions » (ScreenTransactions): the immutable payment ledger; no refund anywhere. */
export function TransactionsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [status, setStatus] = useState<TransactionStatus | ''>('');
  const [provider, setProvider] = useState<PaymentProvider | ''>('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [openId, setOpenId] = useState<string | null>(null);

  const ledger = useInfiniteQuery({
    queryKey: [...transactionsKey, status, provider, deferredSearch],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(
        api.GET('/admin/v1/transactions', {
          params: {
            query: {
              status: status || undefined,
              provider: provider || undefined,
              search: deferredSearch || undefined,
              cursor: pageParam,
            },
          },
        }),
      ),
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last.at(-1)?.id : undefined),
  });
  const rows = useMemo(() => ledger.data?.pages.flat() ?? [], [ledger.data]);
  const columns = useMemo<Column<Transaction>[]>(() => {
    const money = (minor: number | null | undefined, currency: string) =>
      minor === null || minor === undefined ? '—' : formatMoney(locale, minor, currency);
    return [
      {
        id: 'number',
        header: t('admin.transactions.colNumber'),
        cell: (row) => <span className="dt-mono">{row.transactionId}</span>,
      },
      {
        id: 'date',
        header: t('admin.transactions.colDate'),
        cell: (row) => (
          <span className="nw">{formatDateTime(locale, row.paymentDate ?? row.createdAt)}</span>
        ),
      },
      {
        id: 'user',
        header: t('admin.transactions.colUser'),
        cell: (row) => personName(row.user, t),
      },
      {
        id: 'plan',
        header: t('admin.transactions.colPlan'),
        hideable: true,
        cell: (row) => (
          <span className="dt-mono">
            {row.plan.code} v{row.plan.version}
          </span>
        ),
      },
      {
        id: 'amount',
        header: t('admin.transactions.colAmount'),
        align: 'end',
        cell: (row) => money(row.amountMinor, row.currency),
      },
      {
        id: 'fees',
        header: t('admin.transactions.colFees'),
        align: 'end',
        cell: (row) =>
          row.fees ? (
            <span className="dt-row-flex justify-end">
              {row.fees.rateMissing
                ? t('admin.transactions.feeUnknown')
                : money(row.fees.feesMinor, row.currency)}
              {row.fees.estimated ? (
                <span className="dt-cap">{t('admin.finance.estimated')}</span>
              ) : null}
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'net',
        header: t('admin.transactions.colNet'),
        align: 'end',
        cell: (row) => money(row.netAmountMinor, row.currency),
      },
      {
        id: 'provider',
        header: t('admin.transactions.colProvider'),
        hideable: true,
        cell: (row) => t(PROVIDER_LABELS[row.paymentProvider]),
      },
      {
        id: 'reference',
        header: t('admin.transactions.colReference'),
        hideable: true,
        cell: (row) => <span className="dt-mono">{row.providerReference ?? '—'}</span>,
      },
      {
        id: 'status',
        header: t('admin.transactions.colStatus'),
        cell: (row) => (
          <Badge tone={TRANSACTION_STATUS_TONES[row.status]}>
            {t(TRANSACTION_STATUS_LABELS[row.status])}
          </Badge>
        ),
      },
    ];
  }, [t, locale]);

  return (
    <>
      <PageHeader title={t('admin.transactions.title')} caption={t('admin.transactions.caption')} />
      {ledger.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(ledger.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.transactions.title')}
          columns={columns}
          rows={rows}
          rowId={(row) => row.id}
          loading={ledger.isPending}
          selectedId={openId}
          onOpen={(row) => setOpenId(row.id)}
          toolbar={
            <>
              <div className="w-sidebar">
                <TextInput
                  type="search"
                  mono
                  aria-label={t('admin.transactions.search')}
                  placeholder={t('admin.transactions.search')}
                  value={search}
                  unit={<Search size={14} aria-hidden />}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="w-sidebar">
                <Select
                  aria-label={t('admin.transactions.colStatus')}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as TransactionStatus | '')}
                >
                  <option value="">{t('admin.transactions.allStatuses')}</option>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {t(TRANSACTION_STATUS_LABELS[value])}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-sidebar">
                <Select
                  aria-label={t('admin.transactions.colProvider')}
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as PaymentProvider | '')}
                >
                  <option value="">{t('admin.transactions.allProviders')}</option>
                  {PROVIDERS.map((value) => (
                    <option key={value} value={value}>
                      {t(PROVIDER_LABELS[value])}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          }
        />
      )}
      {ledger.hasNextPage ? (
        <div>
          <Button
            size="sm"
            busy={ledger.isFetchingNextPage}
            onClick={() => void ledger.fetchNextPage()}
          >
            {t('admin.table.loadMore')}
          </Button>
        </div>
      ) : null}
      <TransactionDrawer transactionId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
