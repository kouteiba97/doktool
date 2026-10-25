'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Download } from 'lucide-react';
import { useState } from 'react';
import { api, call } from '@/api/client';
import { downloadFile } from '@/api/download';
import { formatDate, formatMoney, formatNumber } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useGrants } from '@/session/session';
import { Button } from '@/ui/button';
import { BarSeriesChart, LineSeriesChart } from '@/ui/charts';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, PageHeader, Skeleton } from '@/ui/feedback';
import { Metric } from '@/ui/metric';
import { type Period, PeriodPicker, usePeriod } from '@/ui/period';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import { PROVIDER_LABELS } from '../subscriptions/labels';
import { ExpensesPanel } from './expenses-panel';

/** « Finance » (ScreenAdminRevenue, ScreenExpenses, reports): section 15, Lock L40. */
export function FinancePage() {
  const { t } = useI18n();
  const period = usePeriod('30d');
  return (
    <>
      <PageHeader
        title={t('admin.finance.title')}
        caption={t('admin.finance.caption')}
        actions={<PeriodPicker state={period} />}
      />
      {period.period === null ? (
        <Alert tone="info">{t('admin.period.chooseDays')}</Alert>
      ) : (
        <Tabs defaultValue="overview" className="dt-stack">
          <TabList label={t('admin.finance.title')}>
            <Tab value="overview">{t('admin.finance.tabOverview')}</Tab>
            <Tab value="expenses">{t('admin.finance.tabExpenses')}</Tab>
            <Tab value="reports">{t('admin.finance.tabReports')}</Tab>
          </TabList>
          <TabPanel value="overview">
            <FinanceOverview period={period.period} />
          </TabPanel>
          <TabPanel value="expenses">
            <ExpensesPanel period={period.period} />
          </TabPanel>
          <TabPanel value="reports">
            <Reports period={period.period} />
          </TabPanel>
        </Tabs>
      )}
    </>
  );
}

/**
 * « Vue d'ensemble » tab: the ledger (gross → fees → net), profit, subscriptions, revenue by plan
 * and the charts.
 */
function FinanceOverview({ period }: { period: Period }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  // Every figure of the period and the one before.
  const overview = useQuery({
    queryKey: ['admin', 'finance', 'overview', period],
    queryFn: () => call(api.GET('/admin/v1/finance/overview', { params: { query: period } })),
  });
  if (overview.isPending) return <Skeleton lines={8} />;
  if (overview.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(overview.error)}
      </EmptyState>
    );
  }
  const data = overview.data;
  // An amount in DZD in the UI language.
  const money = (minor: number) => formatMoney(locale, minor, data.currency);
  const { ledger, previousLedger, subscriptions } = data;
  // Label of a chart bar: a day, or a month for long periods.
  const bucketLabel = (iso: string) =>
    data.bucket === 'MONTH'
      ? new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(iso))
      : formatDate(locale, iso);
  const plans = [...new Set(data.series.flatMap((point) => Object.keys(point.byPlan)))];
  const series = data.series.map((point) => ({
    start: point.start,
    ...Object.fromEntries(plans.map((plan) => [plan, point.byPlan[plan] ?? 0])),
    started: point.started,
    renewed: point.renewed,
    ended: point.ended,
  }));
  const partial = data.series.some((point) => point.partial);

  return (
    <div className="dt-stack gap-4">
      {data.feeRatesMissing.length > 0 ? (
        <Alert tone="warning" title={t('admin.finance.ratesMissingTitle')}>
          {t('admin.finance.ratesMissingBody', {
            providers: data.feeRatesMissing
              .map((provider) => t(PROVIDER_LABELS[provider]))
              .join(', '),
          })}
        </Alert>
      ) : null}

      <section aria-labelledby="ledger-title" className="dt-stack">
        <h2 id="ledger-title" className="dt-heading">
          {t('admin.finance.ledger')}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Metric
            label={t('admin.finance.gross')}
            value={money(ledger.grossMinor)}
            current={ledger.grossMinor}
            previous={previousLedger.grossMinor}
            note={
              ledger.adjustmentsMinor !== 0
                ? t('admin.finance.adjustmentsNote', { amount: money(ledger.adjustmentsMinor) })
                : t('admin.finance.payments', { count: ledger.payments })
            }
          />
          <Metric
            label={t('admin.finance.fees')}
            value={money(ledger.feesMinor)}
            current={ledger.feesMinor}
            previous={previousLedger.feesMinor}
            note={
              ledger.estimatedFeesMinor > 0
                ? t('admin.finance.estimatedPart', { amount: money(ledger.estimatedFeesMinor) })
                : null
            }
          />
          <Metric
            label={t('admin.finance.netRevenue')}
            value={money(ledger.netRevenueMinor)}
            current={ledger.netRevenueMinor}
            previous={previousLedger.netRevenueMinor}
            emphasis
          />
        </div>
      </section>

      <section aria-labelledby="profit-title" className="dt-stack">
        <h2 id="profit-title" className="dt-heading">
          {t('admin.finance.profitability')}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Metric label={t('admin.finance.netRevenue')} value={money(ledger.netRevenueMinor)} />
          <Metric
            label={t('admin.finance.expenses')}
            value={money(ledger.expensesMinor)}
            current={ledger.expensesMinor}
            previous={previousLedger.expensesMinor}
          />
          <Metric
            label={t('admin.finance.netProfit')}
            value={money(ledger.netProfitMinor)}
            current={ledger.netProfitMinor}
            previous={previousLedger.netProfitMinor}
            emphasis
          />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Metric label={t('admin.finance.mrr')} value={money(subscriptions.mrrMinor)} />
        <Metric
          label={t('admin.finance.arr')}
          value={money(subscriptions.arrMinor)}
          note={t('admin.finance.projection')}
        />
        <Metric
          label={t('admin.finance.paying')}
          value={formatNumber(locale, subscriptions.payingProfessionals)}
        />
        <Metric
          label={t('admin.finance.started')}
          value={formatNumber(locale, subscriptions.started)}
          current={subscriptions.started}
          previous={subscriptions.previousStarted}
        />
        <Metric
          label={t('admin.finance.renewed')}
          value={formatNumber(locale, subscriptions.renewed)}
          current={subscriptions.renewed}
          previous={subscriptions.previousRenewed}
        />
        <Metric
          label={t('admin.finance.ended')}
          value={formatNumber(locale, subscriptions.ended)}
          current={subscriptions.ended}
          previous={subscriptions.previousEnded}
        />
      </div>

      <section className="dt-card">
        <h2 className="dt-heading">{t('admin.finance.revenueOverTime')}</h2>
        {partial ? <p className="dt-cap">{t('admin.finance.currentPeriodNote')}</p> : null}
        <BarSeriesChart
          label={t('admin.finance.revenueOverTime')}
          data={series}
          xKey="start"
          stacked
          series={plans.map((plan) => ({ key: plan, label: plan }))}
          formatX={bucketLabel}
          formatY={(value) => money(value)}
          formatAxis={(value) =>
            new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
              value / 100,
            )
          }
        />
      </section>
      <section className="dt-card">
        <h2 className="dt-heading">{t('admin.finance.renewalsVsEndings')}</h2>
        <LineSeriesChart
          label={t('admin.finance.renewalsVsEndings')}
          data={series}
          xKey="start"
          series={[
            { key: 'started', label: t('admin.finance.started') },
            { key: 'renewed', label: t('admin.finance.renewed') },
            { key: 'ended', label: t('admin.finance.ended') },
          ]}
          formatX={bucketLabel}
          formatY={(value) => formatNumber(locale, value)}
        />
      </section>
      <section className="dt-card">
        <h2 className="dt-heading">{t('admin.finance.revenueByPlan')}</h2>
        {data.revenueByPlan.length === 0 ? (
          <p className="dt-cap">{t('admin.finance.noPayments')}</p>
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.plans.colCode')}</th>
                <th scope="col" className="r">
                  {t('admin.finance.paymentsCol')}
                </th>
                <th scope="col" className="r">
                  {t('admin.finance.gross')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.revenueByPlan.map((row) => (
                <tr key={row.planCode}>
                  <td className="dt-mono">{row.planCode}</td>
                  <td className="r">{formatNumber(locale, row.payments)}</td>
                  <td className="r">{money(row.grossMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="dt-cap">{t('admin.plans.noRefund')}</p>
    </div>
  );
}

const REPORTS: {
  kind: 'revenue-by-plan' | 'subscriptions' | 'provider-fees';
  title: MessageKey;
  body: MessageKey;
}[] = [
  {
    kind: 'revenue-by-plan',
    title: 'admin.finance.reportRevenueTitle',
    body: 'admin.finance.reportRevenueBody',
  },
  {
    kind: 'subscriptions',
    title: 'admin.finance.reportSubscriptionsTitle',
    body: 'admin.finance.reportSubscriptionsBody',
  },
  {
    kind: 'provider-fees',
    title: 'admin.finance.reportFeesTitle',
    body: 'admin.finance.reportFeesBody',
  },
];

/** « Rapports »: CSV with the metric definitions on top (section 15). */
function Reports({ period }: { period: Period }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const { has } = useGrants();
  const [busy, setBusy] = useState<string | null>(null);
  if (!has('finance.reports.export')) {
    return (
      <Alert tone="info">{t('admin.access.deniedBody', { grant: 'finance.reports.export' })}</Alert>
    );
  }
  // Downloads one CSV report through the API (the export is audited).
  const download = async (kind: (typeof REPORTS)[number]['kind']) => {
    setBusy(kind);
    try {
      await downloadFile(
        `/admin/v1/finance/reports/${kind}`,
        { ...period, locale: locale === 'en' ? 'EN' : 'FR' },
        `doktool-${kind}-${period.from.slice(0, 10)}.csv`,
      );
    } catch (error) {
      toast(errorText(error), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {REPORTS.map((report) => (
        <section key={report.kind} className="dt-card">
          <h3 className="dt-heading">{t(report.title)}</h3>
          <p className="dt-cap">{t(report.body)}</p>
          <div>
            {/* « Télécharger le CSV » of this report. */}
            <Button busy={busy === report.kind} onClick={() => void download(report.kind)}>
              <Download size={16} aria-hidden />
              {t('admin.finance.downloadCsv')}
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
