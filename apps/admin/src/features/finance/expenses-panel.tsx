'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDate, formatMoney } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState } from '@/ui/feedback';
import { Field, Select, TextArea, TextInput } from '@/ui/field';
import { OverflowMenu } from '@/ui/menu';
import type { Period } from '@/ui/period';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { parsePrice } from '../subscriptions/plan-form';
import { type PaymentProvider, PROVIDER_LABELS } from '../subscriptions/labels';
import { PaymentMethodsCard } from './payment-methods-card';

type Expense = Schemas['ExpenseDto'];
type Category = Schemas['ExpenseCategory'];

const CATEGORIES: Record<Category, MessageKey> = {
  INFRASTRUCTURE: 'admin.finance.categoryInfrastructure',
  CLINICAL_REVIEW: 'admin.finance.categoryClinicalReview',
  SUPPORT: 'admin.finance.categorySupport',
  OTHER: 'admin.finance.categoryOther',
};

/** One line of a provider statement: `DT-2026-001842;75,00` (fee in DZD). */
export function parseSettlementLines(text: string): {
  items: { transactionId: string; feesMinor: number }[];
  invalid: number;
} {
  const items: { transactionId: string; feesMinor: number }[] = [];
  let invalid = 0;
  for (const line of text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    const [id, fee] = line.split(/[;\t]/).map((value) => value?.trim() ?? '');
    const feesMinor = fee ? parsePrice(fee) : null;
    if (id && /^DT-\d{4}-\d{6}$/.test(id.toUpperCase()) && feesMinor !== null) {
      items.push({ transactionId: id.toUpperCase(), feesMinor });
    } else {
      invalid += 1;
    }
  }
  return { items, invalid };
}

/**
 * « Dépenses »: operating expenses, payment methods, provider fee rates and fee settlement
 * (section 15, ADR-021).
 */
export function ExpensesPanel({ period }: { period: Period }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const canWrite = has('finance.expenses.write');
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [settling, setSettling] = useState(false);
  const [rateFor, setRateFor] = useState<PaymentProvider | null>(null);

  const expenses = useQuery({
    queryKey: ['admin', 'finance', 'expenses', period],
    queryFn: () => call(api.GET('/admin/v1/finance/expenses', { params: { query: period } })),
  });
  const rates = useQuery({
    queryKey: ['admin', 'finance', 'fee-rates'],
    queryFn: () => call(api.GET('/admin/v1/finance/fee-rates')),
  });
  const refresh = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    toast(message);
  };

  const columns = useMemo<Column<Expense>[]>(
    () => [
      {
        id: 'date',
        header: t('admin.finance.expenseDate'),
        cell: (row) => formatDate(locale, row.incurredOn),
      },
      {
        id: 'category',
        header: t('admin.finance.expenseCategory'),
        cell: (row) => t(CATEGORIES[row.category]),
      },
      {
        id: 'label',
        header: t('admin.finance.expenseLabel'),
        cell: (row) => (
          <span className={row.voidedAt ? 'line-through' : undefined}>
            {row.label}
            {row.voidedAt ? <span className="dt-cap"> · {row.voidReason}</span> : null}
          </span>
        ),
      },
      {
        id: 'amount',
        header: t('admin.finance.expenseAmount'),
        align: 'end',
        cell: (row) => formatMoney(locale, row.amountMinor, row.currency),
      },
      {
        id: 'by',
        header: t('admin.finance.expenseBy'),
        hideable: true,
        cell: (row) => row.createdBy.fullName,
      },
      {
        id: 'state',
        header: t('admin.finance.expenseState'),
        cell: (row) =>
          row.voidedAt ? (
            <Badge tone="outline">{t('admin.finance.voided')}</Badge>
          ) : (
            <Badge tone="neutral">{t('admin.finance.counted')}</Badge>
          ),
      },
      {
        id: 'actions',
        header: t('admin.common.actions'),
        cell: (row) => (
          <OverflowMenu
            label={t('admin.common.moreActions')}
            actions={[
              {
                label: t('admin.finance.void'),
                onSelect: () => setVoiding(row),
                hidden: !canWrite || row.voidedAt !== null,
                danger: true,
              },
            ]}
          />
        ),
      },
    ],
    [t, locale, canWrite],
  );

  return (
    <div className="dt-stack gap-4">
      <section className="dt-stack">
        <div className="flex items-center gap-2">
          <h2 className="dt-heading">{t('admin.finance.tabExpenses')}</h2>
          {canWrite ? (
            <Button size="sm" variant="primary" className="ms-auto" onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden />
              {t('admin.finance.addExpense')}
            </Button>
          ) : null}
        </div>
        {expenses.isError ? (
          <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
            {errorText(expenses.error)}
          </EmptyState>
        ) : (
          <DataTable
            label={t('admin.finance.tabExpenses')}
            columns={columns}
            rows={expenses.data ?? []}
            rowId={(row) => row.id}
            loading={expenses.isPending}
            empty={<EmptyState icon={Receipt} title={t('admin.finance.noExpenses')} />}
          />
        )}
      </section>

      <PaymentMethodsCard />

      <section className="dt-card">
        <div className="flex items-center gap-2">
          <h2 className="dt-heading">{t('admin.finance.feeRates')}</h2>
          {canWrite ? (
            <Button size="sm" className="ms-auto" onClick={() => setSettling(true)}>
              {t('admin.finance.settleFees')}
            </Button>
          ) : null}
        </div>
        <p className="dt-cap">{t('admin.finance.feeRatesHelp')}</p>
        <ul className="dt-stack gap-2">
          {(rates.data ?? []).map((rate) => (
            <li key={rate.provider} className="dt-row-flex justify-between">
              <span>
                <b>{t(PROVIDER_LABELS[rate.provider])}</b>{' '}
                {rate.rateBps === null || rate.fixedMinor === null ? (
                  <Badge tone="warning">{t('admin.finance.rateNotSet')}</Badge>
                ) : (
                  <span>
                    {t('admin.finance.rateValue', {
                      percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                        rate.rateBps / 100,
                      ),
                      fixed: formatMoney(locale, rate.fixedMinor, 'DZD'),
                    })}
                  </span>
                )}
              </span>
              {canWrite ? (
                <Button size="sm" variant="ghost" onClick={() => setRateFor(rate.provider)}>
                  {t('admin.common.edit')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {adding ? (
        <ExpenseDialog
          onClose={() => setAdding(false)}
          onDone={() => refresh(t('admin.finance.expenseAdded'))}
        />
      ) : null}
      <ReasonDialog
        open={voiding !== null}
        onOpenChange={(open) => (open ? undefined : setVoiding(null))}
        title={t('admin.finance.voidTitle')}
        description={t('admin.finance.voidBody')}
        confirmLabel={t('admin.finance.void')}
        confirmVariant="danger"
        onConfirm={async (reason) => {
          if (!voiding) return;
          await call(
            api.POST('/admin/v1/finance/expenses/{id}/void', {
              params: { path: { id: voiding.id } },
              body: { reason },
            }),
          );
          await refresh(t('admin.finance.expenseVoided'));
        }}
      />
      {rateFor ? (
        <RateDialog
          provider={rateFor}
          current={rates.data?.find((rate) => rate.provider === rateFor) ?? null}
          onClose={() => setRateFor(null)}
          onDone={() => refresh(t('admin.finance.rateSaved'))}
        />
      ) : null}
      {settling ? (
        <SettlementDialog
          onClose={() => setSettling(false)}
          onDone={(settled, skipped) =>
            refresh(t('admin.finance.settleOutcome', { settled, skipped }))
          }
        />
      ) : null}
    </div>
  );
}

function ExpenseDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const [category, setCategory] = useState<Category>('INFRASTRUCTURE');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const minor = parsePrice(amount);
  const ready = label.trim().length > 0 && minor !== null && minor > 0 && day !== '';
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('admin.finance.addExpense')}
      confirmLabel={t('admin.finance.addExpense')}
      ready={ready}
      onConfirm={async (reason) => {
        if (minor === null) return;
        await call(
          api.POST('/admin/v1/finance/expenses', {
            body: { category, label: label.trim(), amountMinor: minor, incurredOn: day, reason },
          }),
        );
        await onDone();
      }}
    >
      <Field label={t('admin.finance.expenseCategory')} required>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            {(Object.keys(CATEGORIES) as Category[]).map((value) => (
              <option key={value} value={value}>
                {t(CATEGORIES[value])}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('admin.finance.expenseLabel')} required>
        {({ inputId }) => (
          <TextInput
            id={inputId}
            maxLength={200}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.finance.expenseAmount')} required help={t('admin.plans.priceHelp')}>
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
        <Field label={t('admin.finance.expenseDate')} required>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          )}
        </Field>
      </div>
    </ReasonDialog>
  );
}

function RateDialog({
  provider,
  current,
  onClose,
  onDone,
}: {
  provider: PaymentProvider;
  current: Schemas['FeeRateDto'] | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [percent, setPercent] = useState(
    current?.rateBps !== null && current?.rateBps !== undefined
      ? String(current.rateBps / 100)
      : '',
  );
  const [fixed, setFixed] = useState(
    current?.fixedMinor !== null && current?.fixedMinor !== undefined
      ? (current.fixedMinor / 100).toFixed(2)
      : '0',
  );
  const percentValue = Number(percent.replace(',', '.'));
  const rateBps =
    Number.isFinite(percentValue) && percent.trim() !== '' ? Math.round(percentValue * 100) : null;
  const fixedMinor = parsePrice(fixed);
  const ready = rateBps !== null && rateBps >= 0 && rateBps <= 10_000 && fixedMinor !== null;
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('admin.finance.rateTitle', { provider: t(PROVIDER_LABELS[provider]) })}
      description={t('admin.finance.rateBody')}
      confirmLabel={t('admin.common.save')}
      ready={ready}
      onConfirm={async (reason) => {
        if (rateBps === null || fixedMinor === null) return;
        await call(
          api.PUT('/admin/v1/finance/fee-rates/{provider}', {
            params: { path: { provider } },
            body: { rateBps, fixedMinor, reason },
          }),
        );
        await onDone();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.finance.ratePercent')} required>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              inputMode="decimal"
              unit="%"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.finance.rateFixed')} required>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              inputMode="decimal"
              unit="DZD"
              value={fixed}
              onChange={(event) => setFixed(event.target.value)}
            />
          )}
        </Field>
      </div>
    </ReasonDialog>
  );
}

function SettlementDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (settled: number, skipped: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const parsed = parseSettlementLines(text);
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('admin.finance.settleFees')}
      description={t('admin.finance.settleBody')}
      confirmLabel={t('admin.finance.settleConfirm', { count: parsed.items.length })}
      ready={parsed.items.length > 0 && parsed.items.length <= 500}
      onConfirm={async (reason) => {
        const results = await call(
          api.POST('/admin/v1/finance/fee-settlements', { body: { items: parsed.items, reason } }),
        );
        const settled = results.filter((result) => result.outcome === 'SETTLED').length;
        await onDone(settled, results.length - settled);
      }}
    >
      <Field
        label={t('admin.finance.settleLines')}
        required
        help={t('admin.finance.settleLinesHelp')}
      >
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            mono
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      {parsed.invalid > 0 ? (
        <Alert tone="warning">{t('admin.finance.settleInvalid', { count: parsed.invalid })}</Alert>
      ) : null}
    </ReasonDialog>
  );
}
