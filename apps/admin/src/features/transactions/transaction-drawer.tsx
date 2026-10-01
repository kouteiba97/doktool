'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDateTime, formatMoney } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, Skeleton } from '@/ui/feedback';
import { Field, Select, TextInput } from '@/ui/field';
import { OverflowMenu } from '@/ui/menu';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { AuditHistory } from '../audit/audit-history';
import { parsePrice } from '../subscriptions/plan-form';
import {
  PROVIDER_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_STATUS_TONES,
} from '../subscriptions/labels';

type Detail = Schemas['AdminTransactionDetailDto'];
type Adjustment = Schemas['AdjustmentDto'];
type Reason = Schemas['AdjustmentBody']['reasonCode'];

const REASONS: Record<Reason, MessageKey> = {
  PROVIDER_ERROR: 'admin.transactions.reasonProviderError',
  DUPLICATE_PAYMENT: 'admin.transactions.reasonDuplicatePayment',
  LEGAL_OBLIGATION: 'admin.transactions.reasonLegalObligation',
  ACCOUNTING_CORRECTION: 'admin.transactions.reasonAccountingCorrection',
  OTHER: 'admin.transactions.reasonOther',
};

/**
 * Transaction drawer: every field, the linked plan and person, adjustments and history. The
 * `•••` holds « Ajustement exceptionnel… », Super Admin only, approved by another admin; it is
 * not a refund and has no tab, list or status of its own (section 15).
 */
export function TransactionDrawer({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has, me } = useGrants();
  const [adjusting, setAdjusting] = useState(false);
  const [approving, setApproving] = useState<Adjustment | null>(null);
  const key = ['admin', 'transactions', 'detail', transactionId ?? ''] as const;
  const detail = useQuery({
    queryKey: key,
    queryFn: () =>
      call(
        api.GET('/admin/v1/transactions/{id}', { params: { path: { id: transactionId ?? '' } } }),
      ),
    enabled: transactionId !== null,
  });
  const row = detail.data;

  const updated = (next: Detail, message: string) => {
    queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'], exact: false });
    toast(message);
  };
  const money = (minor: number) => formatMoney(locale, minor, row?.currency ?? 'DZD');

  return (
    <Drawer
      open={transactionId !== null}
      onClose={onClose}
      mode="inspect"
      title={
        row ? (
          <span className="dt-mono">{row.transactionId}</span>
        ) : (
          t('admin.transactions.transaction')
        )
      }
      caption={row ? `${row.user.firstName} ${row.user.lastName}` : null}
      status={
        row ? (
          <Badge tone={TRANSACTION_STATUS_TONES[row.status]}>
            {t(TRANSACTION_STATUS_LABELS[row.status])}
          </Badge>
        ) : null
      }
      footer={
        row ? (
          <OverflowMenu
            label={t('admin.common.moreActions')}
            actions={[
              {
                label: t('admin.transactions.adjust'),
                onSelect: () => setAdjusting(true),
                hidden: !has('transactions.adjustment.request') || row.status !== 'SUCCEEDED',
              },
            ]}
          />
        ) : null
      }
    >
      {detail.isPending ? (
        <Skeleton lines={8} />
      ) : detail.isError || !row ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(detail.error)}
        </EmptyState>
      ) : (
        <div className="dt-stack gap-4">
          <dl className="dt-dl">
            <dt>{t('admin.transactions.colAmount')}</dt>
            <dd>{money(row.amountMinor)}</dd>
            <dt>{t('admin.transactions.colFees')}</dt>
            <dd>
              {row.fees
                ? row.fees.rateMissing
                  ? t('admin.transactions.feeUnknown')
                  : `${money(row.fees.feesMinor)}${row.fees.estimated ? ` · ${t('admin.finance.estimated')}` : ''}`
                : '—'}
            </dd>
            <dt>{t('admin.transactions.colNet')}</dt>
            <dd>{row.netAmountMinor === null ? '—' : money(row.netAmountMinor)}</dd>
            <dt>{t('admin.transactions.colPlan')}</dt>
            <dd>
              {locale === 'en' ? row.plan.nameEn : row.plan.nameFr}{' '}
              <span className="dt-mono dt-cap">
                {row.plan.code} v{row.plan.version}
              </span>
            </dd>
            <dt>{t('admin.transactions.colProvider')}</dt>
            <dd>{t(PROVIDER_LABELS[row.paymentProvider])}</dd>
            <dt>{t('admin.transactions.colReference')}</dt>
            <dd className="dt-mono">{row.providerReference ?? '—'}</dd>
            <dt>{t('admin.transactions.paymentDate')}</dt>
            <dd>{row.paymentDate ? formatDateTime(locale, row.paymentDate) : '—'}</dd>
            <dt>{t('admin.transactions.createdAt')}</dt>
            <dd>{formatDateTime(locale, row.createdAt)}</dd>
            <dt>{t('admin.transactions.subscription')}</dt>
            <dd className="dt-mono">{row.subscriptionId}</dd>
          </dl>

          {row.adjustments.length > 0 ? (
            <section className="dt-stack">
              <h3 className="dt-heading">{t('admin.transactions.adjustments')}</h3>
              <ul className="dt-stack gap-2">
                {row.adjustments.map((adjustment) => (
                  <li key={adjustment.id} className="dt-card gap-1 p-3">
                    <div className="dt-row-flex">
                      <b>{money(adjustment.amountMinor)}</b>
                      <Badge tone={adjustment.approvedBy ? 'success' : 'warning'}>
                        {adjustment.approvedBy
                          ? t('admin.transactions.approved')
                          : t('admin.transactions.awaitingApproval')}
                      </Badge>
                      <span className="dt-cap">
                        {adjustment.reasonCode in REASONS
                          ? t(REASONS[adjustment.reasonCode as Reason])
                          : adjustment.reasonCode}
                      </span>
                    </div>
                    <span>{adjustment.reasonNote}</span>
                    <span className="dt-cap">
                      {t('admin.transactions.requestedBy', {
                        name: adjustment.requestedBy.fullName,
                        date: formatDateTime(locale, adjustment.createdAt),
                      })}
                      {adjustment.approvedBy && adjustment.approvedAt
                        ? ` · ${t('admin.transactions.approvedBy', {
                            name: adjustment.approvedBy.fullName,
                            date: formatDateTime(locale, adjustment.approvedAt),
                          })}`
                        : ''}
                    </span>
                    {!adjustment.approvedBy && has('transactions.adjustment.approve') ? (
                      adjustment.requestedBy.id === me?.id ? (
                        <span className="dt-cap">{t('admin.transactions.secondAdminNeeded')}</span>
                      ) : (
                        <div>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => setApproving(adjustment)}
                          >
                            {t('admin.transactions.approve')}
                          </Button>
                        </div>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="dt-stack">
            <h3 className="dt-heading">{t('admin.transactions.metadata')}</h3>
            <pre className="dt-code">{JSON.stringify(row.metadata, null, 2)}</pre>
          </section>

          <section className="dt-stack">
            <h3 className="dt-heading">{t('admin.verification.tabHistory')}</h3>
            <AuditHistory entries={row.history} />
          </section>

          {adjusting ? (
            <AdjustmentDialog
              transaction={row}
              onClose={() => setAdjusting(false)}
              onDone={(next) => updated(next, t('admin.transactions.adjustmentRequested'))}
            />
          ) : null}
          <ReasonDialog
            open={approving !== null}
            onOpenChange={(open) => (open ? undefined : setApproving(null))}
            title={t('admin.transactions.approveTitle')}
            description={
              approving
                ? t('admin.transactions.approveBody', { amount: money(approving.amountMinor) })
                : undefined
            }
            confirmLabel={t('admin.transactions.approve')}
            onConfirm={async (reason) => {
              if (!approving) return;
              const next = await call(
                api.POST('/admin/v1/transactions/adjustments/{adjustmentId}/approve', {
                  params: { path: { adjustmentId: approving.id } },
                  body: { reason },
                }),
              );
              updated(next, t('admin.transactions.adjustmentApproved'));
            }}
          />
        </div>
      )}
    </Drawer>
  );
}

function AdjustmentDialog({
  transaction,
  onClose,
  onDone,
}: {
  transaction: Detail;
  onClose: () => void;
  onDone: (next: Detail) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<'REVERSAL' | 'CORRECTION'>('REVERSAL');
  const [amount, setAmount] = useState('');
  const [negative, setNegative] = useState(true);
  const [reasonCode, setReasonCode] = useState<Reason | ''>('');
  const parsed = parsePrice(amount);
  const signed = parsed === null ? null : kind === 'REVERSAL' || negative ? -parsed : parsed;
  const ready = signed !== null && signed !== 0 && reasonCode !== '';
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('admin.transactions.adjustTitle')}
      description={t('admin.transactions.adjustBody')}
      confirmLabel={t('admin.transactions.adjustConfirm')}
      ready={ready}
      onConfirm={async (note) => {
        if (signed === null || reasonCode === '') return;
        onDone(
          await call(
            api.POST('/admin/v1/transactions/{id}/adjustments', {
              params: { path: { id: transaction.id } },
              body: { kind, amountMinor: signed, reasonCode, note },
            }),
          ),
        );
      }}
    >
      <Alert tone="info">{t('admin.transactions.notRefund')}</Alert>
      <Field label={t('admin.transactions.kind')} required>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={kind}
            onChange={(event) => setKind(event.target.value as 'REVERSAL' | 'CORRECTION')}
          >
            <option value="REVERSAL">{t('admin.transactions.kindReversal')}</option>
            <option value="CORRECTION">{t('admin.transactions.kindCorrection')}</option>
          </Select>
        )}
      </Field>
      <Field
        label={t('admin.transactions.adjustAmount')}
        required
        help={t('admin.transactions.adjustAmountHelp')}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            inputMode="decimal"
            unit="DZD"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
      </Field>
      {kind === 'CORRECTION' ? (
        <Field label={t('admin.transactions.direction')} required>
          {({ inputId }) => (
            <Select
              id={inputId}
              value={negative ? 'minus' : 'plus'}
              onChange={(event) => setNegative(event.target.value === 'minus')}
            >
              <option value="minus">{t('admin.transactions.directionMinus')}</option>
              <option value="plus">{t('admin.transactions.directionPlus')}</option>
            </Select>
          )}
        </Field>
      ) : null}
      <Field label={t('admin.transactions.reasonCode')} required>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as Reason | '')}
          >
            <option value="" disabled>
              {t('admin.common.choose')}
            </option>
            {(Object.keys(REASONS) as Reason[]).map((value) => (
              <option key={value} value={value}>
                {t(REASONS[value])}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <p className="dt-cap">{t('admin.transactions.noteIsReason')}</p>
    </ReasonDialog>
  );
}
