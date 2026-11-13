'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleAlert, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDate } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { Select, TextInput } from '@/ui/field';
import { useDebounced } from '@/ui/use-debounced';
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_TONES } from '../subscriptions/labels';
import { PROFESSIONAL_TYPE_LABELS, STATUS_LABELS, STATUS_TONES } from '../verification/labels';
import { usersKey } from './labels';
import { UserDrawer } from './user-drawer';

/** One row of the user list. */
type User = Schemas['AdminUserDto'];
type ProfessionalType = Schemas['ProfessionalType'];

/** Rows per page of the API (a full page means there may be more). */
const PAGE_SIZE = 50;

/** « Utilisateurs » (ScreenUsersAdmin): who uses DokTool, with their verification and plan. */
export function UsersPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [search, setSearch] = useState('');
  const deferredSearch = useDebounced(search.trim());
  const [type, setType] = useState<ProfessionalType | ''>('');
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED' | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Pages of users for the current search and filters; the next page starts after the last id.
  const users = useInfiniteQuery({
    queryKey: [...usersKey, deferredSearch, type, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(
        api.GET('/admin/v1/users', {
          params: {
            query: {
              search: deferredSearch || undefined,
              professionalType: type || undefined,
              status: status || undefined,
              cursor: pageParam,
            },
          },
        }),
      ),
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last.at(-1)?.id : undefined),
  });
  const rows = useMemo(() => users.data?.pages.flat() ?? [], [users.data]);

  // The table's columns (rebuilt when the language changes).
  const columns = useMemo<Column<User>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.users.colName'),
        cell: (row) => (
          <div>
            <b>
              {row.firstName} {row.lastName}
            </b>
            <div className="dt-cap">{row.email ?? row.phone ?? ''}</div>
          </div>
        ),
      },
      {
        id: 'type',
        header: t('admin.users.colType'),
        cell: (row) =>
          row.professionalType ? t(PROFESSIONAL_TYPE_LABELS[row.professionalType]) : '—',
      },
      {
        id: 'identity',
        header: t('admin.users.colIdentity'),
        hideable: true,
        cell: (row) => (
          <Badge tone={STATUS_TONES[row.verification.identity]}>
            {t(STATUS_LABELS[row.verification.identity])}
          </Badge>
        ),
      },
      {
        id: 'status',
        header: t('admin.users.colStatus'),
        cell: (row) => (
          <Badge tone={STATUS_TONES[row.verification.status]}>
            {t(STATUS_LABELS[row.verification.status])}
          </Badge>
        ),
      },
      {
        id: 'subscription',
        header: t('admin.users.colSubscription'),
        cell: (row) =>
          row.subscription ? (
            <Badge tone={SUBSCRIPTION_STATUS_TONES[row.subscription]}>
              {t(SUBSCRIPTION_STATUS_LABELS[row.subscription])}
            </Badge>
          ) : (
            '—'
          ),
      },
      {
        id: 'affiliation',
        header: t('admin.users.colSpecialty'),
        hideable: true,
        cell: (row) => (row.specialty ? row.specialty[locale] : (row.university ?? '—')),
      },
      {
        id: 'lastSeen',
        header: t('admin.users.colLastSeen'),
        hideable: true,
        cell: (row) => (row.lastSeenAt ? formatDate(locale, row.lastSeenAt) : '—'),
      },
      {
        id: 'account',
        header: t('admin.users.colAccount'),
        cell: (row) =>
          row.status === 'SUSPENDED' ? (
            <Badge tone="warning">{t('admin.users.suspended')}</Badge>
          ) : (
            <Badge tone="neutral">{t('admin.users.active')}</Badge>
          ),
      },
    ],
    [t, locale],
  );

  return (
    <>
      <PageHeader title={t('admin.users.title')} caption={t('admin.users.caption')} />
      {users.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(users.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.users.title')}
          columns={columns}
          rows={rows}
          rowId={(row) => row.id}
          loading={users.isPending}
          selectedId={openId}
          onOpen={(row) => setOpenId(row.id)}
          toolbar={
            <>
              <div className="w-sidebar">
                <TextInput
                  type="search"
                  aria-label={t('admin.users.search')}
                  placeholder={t('admin.users.search')}
                  value={search}
                  unit={<Search size={14} aria-hidden />}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="w-sidebar">
                <Select
                  aria-label={t('admin.users.colType')}
                  value={type}
                  onChange={(event) => setType(event.target.value as ProfessionalType | '')}
                >
                  <option value="">{t('admin.users.allTypes')}</option>
                  {(['DOCTOR', 'RESIDENT', 'STUDENT'] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(PROFESSIONAL_TYPE_LABELS[value])}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-sidebar">
                <Select
                  aria-label={t('admin.users.colAccount')}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'SUSPENDED' | '')}
                >
                  <option value="">{t('admin.users.allAccounts')}</option>
                  <option value="ACTIVE">{t('admin.users.active')}</option>
                  <option value="SUSPENDED">{t('admin.users.suspended')}</option>
                </Select>
              </div>
            </>
          }
        />
      )}
      {users.hasNextPage ? (
        <div>
          {/* « Charger plus »: the next 50 users. */}
          <Button
            size="sm"
            busy={users.isFetchingNextPage}
            onClick={() => void users.fetchNextPage()}
          >
            {t('admin.table.loadMore')}
          </Button>
        </div>
      ) : null}
      <UserDrawer userId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
