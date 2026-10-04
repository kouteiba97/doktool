'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, Eye, KeyRound } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDate, formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, PageHeader, Skeleton } from '@/ui/feedback';
import { Field, Select } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { STATUS_LABELS as VERIFICATION_STATUS_LABELS } from '../verification/labels';
import {
  RECOVERY_REJECTION_LABELS,
  RECOVERY_REJECTION_REASONS,
  RECOVERY_SLOT_LABELS,
  RECOVERY_STATUS_LABELS,
  RECOVERY_STATUS_TONES,
  RECOVERY_TABS,
  recoveryKey,
  type RecoveryPhotoSlot,
  type RecoveryRejectionReason,
  type RecoveryStatus,
} from './labels';
import { RecoveryPhoto } from './recovery-photo';

type Row = Schemas['AdminRecoveryDto'];
type Detail = Schemas['AdminRecoveryDetailDto'];

/**
 * « Récupérations de compte » (ADR-023): people who lost both their e-mail and phone. The
 * reviewer compares the identity photo and the selfie with the account; an approval applies after
 * 24 hours, during which the owner can still stop it by signing in.
 */
export function RecoveryPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [status, setStatus] = useState<RecoveryStatus>('SUBMITTED');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...recoveryKey, status],
    queryFn: () => call(api.GET('/admin/v1/account-recoveries', { params: { query: { status } } })),
  });

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.recovery.colName'),
        cell: (row) => `${row.firstName} ${row.lastName}`,
      },
      {
        id: 'claimed',
        header: t('admin.recovery.colClaimed'),
        cell: (row) => <span className="dt-mono">{row.claimedIdentifier}</span>,
      },
      {
        id: 'new',
        header: t('admin.recovery.colNewContact'),
        cell: (row) => <span className="dt-mono">{row.newDestination}</span>,
      },
      {
        id: 'account',
        header: t('admin.recovery.colAccount'),
        cell: (row) =>
          row.userId ? (
            <Badge tone="neutral">{t('admin.recovery.accountFound')}</Badge>
          ) : (
            <Badge tone="warning">{t('admin.recovery.accountMissing')}</Badge>
          ),
      },
      {
        id: 'submitted',
        header: t('admin.recovery.colSubmitted'),
        cell: (row) => (row.submittedAt ? formatDateTime(locale, row.submittedAt) : '—'),
      },
      {
        id: 'status',
        header: t('admin.recovery.colStatus'),
        cell: (row) => (
          <Badge tone={RECOVERY_STATUS_TONES[row.status]}>
            {t(RECOVERY_STATUS_LABELS[row.status])}
          </Badge>
        ),
      },
    ],
    [t, locale],
  );

  return (
    <div className="dt-stack gap-4">
      <PageHeader title={t('admin.recovery.title')} caption={t('admin.recovery.lead')} />
      <div className="dt-row-flex gap-2" role="tablist" aria-label={t('admin.recovery.title')}>
        {RECOVERY_TABS.map((tab) => (
          <Button
            key={tab}
            size="sm"
            role="tab"
            aria-selected={status === tab}
            variant={status === tab ? 'primary' : 'ghost'}
            onClick={() => setStatus(tab)}
          >
            {t(RECOVERY_STATUS_LABELS[tab])}
          </Button>
        ))}
      </div>
      {list.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(list.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.recovery.title')}
          columns={columns}
          rows={list.data ?? []}
          rowId={(row) => row.id}
          loading={list.isPending}
          selectedId={openId}
          onOpen={(row) => setOpenId(row.id)}
          empty={<EmptyState icon={KeyRound} title={t('admin.recovery.empty')} />}
        />
      )}
      <RecoveryDrawer requestId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function RecoveryDrawer({ requestId, onClose }: { requestId: string | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [photo, setPhoto] = useState<RecoveryPhotoSlot | null>(null);
  const [reasonCode, setReasonCode] = useState<RecoveryRejectionReason | ''>('');

  const detail = useQuery({
    queryKey: [...recoveryKey, 'detail', requestId],
    queryFn: () =>
      call(
        api.GET('/admin/v1/account-recoveries/{id}', {
          params: { path: { id: requestId ?? '' } },
        }),
      ),
    enabled: requestId !== null,
  });
  const record = detail.data;
  const canDecide = has('verification.review') && record?.request.status === 'SUBMITTED';
  const canView = has('verification.documents.view');

  const decided = async (next: Detail, message: string) => {
    queryClient.setQueryData([...recoveryKey, 'detail', next.request.id], next);
    await queryClient.invalidateQueries({ queryKey: recoveryKey });
    setDecision(null);
    toast(message);
  };

  const footer = canDecide ? (
    <div className="end">
      <Button variant="danger" onClick={() => setDecision('reject')}>
        {t('admin.recovery.reject')}
      </Button>
      <Button variant="primary" disabled={!record?.account} onClick={() => setDecision('approve')}>
        <Check size={16} aria-hidden />
        {t('admin.recovery.approve')}
      </Button>
    </div>
  ) : null;

  return (
    <Drawer
      open={requestId !== null}
      onClose={() => {
        setPhoto(null);
        onClose();
      }}
      mode={canDecide ? 'review' : 'inspect'}
      title={
        record
          ? `${record.request.firstName} ${record.request.lastName}`
          : t('admin.recovery.request')
      }
      caption={record ? <span className="dt-mono">{record.request.id}</span> : null}
      status={
        record ? (
          <Badge tone={RECOVERY_STATUS_TONES[record.request.status]}>
            {t(RECOVERY_STATUS_LABELS[record.request.status])}
          </Badge>
        ) : null
      }
      footer={footer}
    >
      {detail.isPending ? (
        <Skeleton lines={8} />
      ) : detail.isError || !record ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(detail.error)}
        </EmptyState>
      ) : (
        <div className="dt-stack gap-4">
          {record.request.status === 'APPROVED' && record.request.effectiveAt ? (
            <Alert tone="warning">
              {t('admin.recovery.approvedPending', {
                date: formatDateTime(locale, record.request.effectiveAt),
              })}
            </Alert>
          ) : null}
          {record.request.rejectionReason ? (
            <Alert tone="info">
              {t(
                RECOVERY_REJECTION_LABELS[
                  record.request.rejectionReason as RecoveryRejectionReason
                ] ?? 'admin.recovery.reasonOther',
              )}
            </Alert>
          ) : null}
          {!record.account ? (
            <Alert tone="warning">{t('admin.recovery.noAccountHelp')}</Alert>
          ) : null}
          <Compare record={record} />
          <section className="dt-stack gap-2">
            <h3 className="dt-label">{t('admin.recovery.photos')}</h3>
            {photo && requestId ? (
              <RecoveryPhoto requestId={requestId} slot={photo} onClose={() => setPhoto(null)} />
            ) : (
              <div className="dt-row-flex gap-2">
                {(['IDENTITY_DOCUMENT', 'SELFIE'] as const).map((slot) => {
                  const present =
                    slot === 'IDENTITY_DOCUMENT'
                      ? record.request.hasIdentityPhoto
                      : record.request.hasSelfie;
                  return (
                    <Button
                      key={slot}
                      size="sm"
                      disabled={!present || !canView}
                      onClick={() => setPhoto(slot)}
                    >
                      <Eye size={14} aria-hidden />
                      {t(RECOVERY_SLOT_LABELS[slot])}
                    </Button>
                  );
                })}
              </div>
            )}
            {!canView ? <p className="dt-cap">{t('admin.recovery.viewGrantHelp')}</p> : null}
            {!record.request.hasIdentityPhoto && !record.request.hasSelfie ? (
              <p className="dt-cap">{t('admin.recovery.photosDeleted')}</p>
            ) : null}
          </section>
          {record.request.decisionNote ? (
            <section className="dt-stack gap-1">
              <h3 className="dt-label">{t('admin.recovery.decisionNote')}</h3>
              <p>{record.request.decisionNote}</p>
            </section>
          ) : null}
          <ReasonDialog
            open={decision === 'approve'}
            onOpenChange={(open) => setDecision(open ? 'approve' : null)}
            title={t('admin.recovery.approveTitle')}
            description={t('admin.recovery.approveBody')}
            confirmLabel={t('admin.recovery.approve')}
            onConfirm={async (note) =>
              decided(
                await call(
                  api.POST('/admin/v1/account-recoveries/{id}/approve', {
                    params: { path: { id: record.request.id } },
                    body: { note },
                  }),
                ),
                t('admin.recovery.approved'),
              )
            }
          />
          <ReasonDialog
            open={decision === 'reject'}
            onOpenChange={(open) => {
              setDecision(open ? 'reject' : null);
              if (!open) setReasonCode('');
            }}
            title={t('admin.recovery.rejectTitle')}
            description={t('admin.recovery.rejectBody')}
            confirmLabel={t('admin.recovery.reject')}
            confirmVariant="danger"
            ready={reasonCode !== ''}
            onConfirm={async (note) => {
              if (reasonCode === '') return;
              await decided(
                await call(
                  api.POST('/admin/v1/account-recoveries/{id}/reject', {
                    params: { path: { id: record.request.id } },
                    body: { reason: reasonCode, note },
                  }),
                ),
                t('admin.recovery.rejected'),
              );
              setReasonCode('');
            }}
          >
            <Field label={t('admin.recovery.rejectReason')} required>
              {({ inputId, describedBy }) => (
                <Select
                  id={inputId}
                  aria-describedby={describedBy}
                  value={reasonCode}
                  onChange={(event) =>
                    setReasonCode(event.target.value as RecoveryRejectionReason | '')
                  }
                >
                  <option value="" disabled>
                    {t('admin.common.choose')}
                  </option>
                  {RECOVERY_REJECTION_REASONS.map((value) => (
                    <option key={value} value={value}>
                      {t(RECOVERY_REJECTION_LABELS[value])}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </ReasonDialog>
        </div>
      )}
    </Drawer>
  );
}

/** What the person said beside what the account holds: the reviewer compares the two. */
function Compare({ record }: { record: Detail }) {
  const { t, locale } = useI18n();
  const { request, account } = record;
  const rows: [string, ReactNode, ReactNode][] = [
    [
      t('admin.recovery.fieldName'),
      `${request.firstName} ${request.lastName}`,
      account ? `${account.firstName} ${account.lastName}` : '—',
    ],
    [
      t('admin.recovery.fieldContact'),
      <span key="claimed" className="dt-mono">
        {request.claimedIdentifier}
      </span>,
      account ? (
        <span key="contacts" className="dt-mono">
          {[account.email, account.phone].filter(Boolean).join(' · ')}
        </span>
      ) : (
        '—'
      ),
    ],
  ];
  return (
    <section className="dt-stack gap-2">
      <table className="dt-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">{t('admin.recovery.given')}</th>
            <th scope="col">{t('admin.recovery.onAccount')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, given, onAccount]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{given}</td>
              <td>{onAccount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="dt-dl">
        <dt>{t('admin.recovery.fieldNewContact')}</dt>
        <dd className="dt-mono">{request.newDestination}</dd>
        {account ? (
          <>
            <dt>{t('admin.recovery.fieldCreated')}</dt>
            <dd>{formatDate(locale, account.createdAt)}</dd>
            <dt>{t('admin.recovery.fieldWilaya')}</dt>
            <dd>{account.wilaya}</dd>
            <dt>{t('admin.recovery.fieldIdentity')}</dt>
            <dd>
              {t(
                VERIFICATION_STATUS_LABELS[
                  account.identityStatus as keyof typeof VERIFICATION_STATUS_LABELS
                ] ?? 'admin.verification.statusNotStarted',
              )}
            </dd>
            <dt>{t('admin.recovery.fieldProfessional')}</dt>
            <dd>
              {t(
                VERIFICATION_STATUS_LABELS[
                  account.professionalStatus as keyof typeof VERIFICATION_STATUS_LABELS
                ] ?? 'admin.verification.statusNotStarted',
              )}
            </dd>
          </>
        ) : null}
        {request.submittedAt ? (
          <>
            <dt>{t('admin.recovery.colSubmitted')}</dt>
            <dd>{formatDateTime(locale, request.submittedAt)}</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}
