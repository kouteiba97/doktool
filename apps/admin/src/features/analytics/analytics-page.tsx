'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Info } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatAge, formatDate } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { BarSeriesChart, LineSeriesChart } from '@/ui/charts';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, PageHeader, Skeleton } from '@/ui/feedback';
import { Select, TextInput } from '@/ui/field';
import { Metric, useCellText } from '@/ui/metric';
import { type Period, PeriodPicker, usePeriod } from '@/ui/period';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { PROFESSIONAL_TYPE_LABELS } from '../verification/labels';

type ProfessionalType = Schemas['ProfessionalType'];
interface Filter extends Period {
  professionalType?: ProfessionalType;
  specialtyCode?: string;
}

const DEMO_MODULES: Record<string, MessageKey> = {
  home: 'admin.analytics.moduleHome',
  search: 'admin.analytics.moduleSearch',
  library: 'admin.analytics.moduleLibrary',
  reference: 'admin.analytics.moduleReference',
  calculator: 'admin.analytics.moduleCalculator',
  favorites: 'admin.analytics.moduleFavorites',
  offline: 'admin.analytics.moduleOffline',
  subscription: 'admin.analytics.moduleSubscription',
  profile: 'admin.analytics.moduleProfile',
};

/**
 * « Analytics — DokTool Intelligence » (ScreenAnalytics, section 16): aggregates of activity inside
 * DokTool, never prescriptions or sales; cells under 10 people read « < 10 ».
 */
export function AnalyticsPage() {
  const { t, locale } = useI18n();
  const period = usePeriod('30d');
  const [professionalType, setProfessionalType] = useState<ProfessionalType | ''>('');
  const [specialty, setSpecialty] = useState('');
  const freshness = useQuery({
    queryKey: ['admin', 'analytics', 'freshness'],
    queryFn: () => call(api.GET('/admin/v1/analytics/freshness')),
    refetchInterval: 60_000,
  });
  const specialtyCode = /^[A-Z][A-Z0-9_]{1,39}$/.test(specialty.trim())
    ? specialty.trim()
    : undefined;
  const filter: Filter | null = period.period
    ? { ...period.period, professionalType: professionalType || undefined, specialtyCode }
    : null;

  return (
    <>
      <PageHeader
        title={t('admin.analytics.title')}
        caption={
          freshness.data?.latestEventAt
            ? t('admin.analytics.updated', { age: formatAge(locale, freshness.data.latestEventAt) })
            : t('admin.analytics.noEvents')
        }
        actions={<PeriodPicker state={period} />}
      />
      <Alert tone="neutral">{t('admin.analytics.disclaimer')}</Alert>
      <div className="dt-row-flex">
        <div className="w-sidebar">
          <Select
            aria-label={t('admin.analytics.filterType')}
            value={professionalType}
            onChange={(event) => setProfessionalType(event.target.value as ProfessionalType | '')}
          >
            <option value="">{t('admin.analytics.allTypes')}</option>
            {(['DOCTOR', 'RESIDENT', 'STUDENT'] as const).map((value) => (
              <option key={value} value={value}>
                {t(PROFESSIONAL_TYPE_LABELS[value])}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-sidebar">
          <TextInput
            mono
            aria-label={t('admin.analytics.filterSpecialty')}
            placeholder={t('admin.analytics.filterSpecialty')}
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value.toUpperCase())}
          />
        </div>
      </div>
      {filter === null ? (
        <Alert tone="info">{t('admin.period.chooseDays')}</Alert>
      ) : (
        <Tabs defaultValue="usage" className="dt-stack">
          <TabList label={t('admin.analytics.title')}>
            <Tab value="usage">{t('admin.analytics.tabUsage')}</Tab>
            <Tab value="library">{t('admin.analytics.tabLibrary')}</Tab>
            <Tab value="calculators">{t('admin.analytics.tabCalculators')}</Tab>
            <Tab value="users">{t('admin.analytics.tabUsers')}</Tab>
            <Tab value="subscriptions">{t('admin.analytics.tabSubscriptions')}</Tab>
            <Tab value="demo">{t('admin.analytics.tabDemo')}</Tab>
          </TabList>
          <TabPanel value="usage">
            <Usage filter={filter} />
          </TabPanel>
          <TabPanel value="library">
            <Library filter={filter} />
          </TabPanel>
          <TabPanel value="calculators">
            <Calculators filter={filter} />
          </TabPanel>
          <TabPanel value="users">
            <Onboarding filter={filter} />
          </TabPanel>
          <TabPanel value="subscriptions">
            <Subscriptions filter={filter} />
          </TabPanel>
          <TabPanel value="demo">
            <Demo filter={filter} />
          </TabPanel>
        </Tabs>
      )}
    </>
  );
}

function Loading({
  query,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown };
  children: () => ReactNode;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  if (query.isPending) return <Skeleton lines={6} />;
  if (query.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(query.error)}
      </EmptyState>
    );
  }
  return <>{children()}</>;
}

function Usage({ filter }: { filter: Filter }) {
  const { t, locale } = useI18n();
  const cell = useCellText();
  const query = useQuery({
    queryKey: ['admin', 'analytics', 'usage', filter],
    queryFn: () => call(api.GET('/admin/v1/analytics/usage', { params: { query: filter } })),
  });
  return (
    <Loading query={query}>
      {() => {
        const data = query.data!;
        const days = data.daily.map((row, index) => ({
          day: row.day,
          current: row.subjects,
          previous: data.previousDaily[index]?.subjects ?? null,
        }));
        return (
          <div className="dt-stack gap-4">
            <div className="grid grid-cols-4 gap-3">
              <Metric
                label={t('admin.analytics.activePeople')}
                value={cell(data.activeSubjects)}
                current={data.activeSubjects}
                previous={data.previousActiveSubjects}
              />
              {data.byType.map((row) => (
                <Metric
                  key={row.professionalType}
                  label={t(PROFESSIONAL_TYPE_LABELS[row.professionalType])}
                  value={cell(row.subjects)}
                />
              ))}
            </div>
            <section className="dt-card">
              <h2 className="dt-heading">{t('admin.analytics.dailyActive')}</h2>
              <LineSeriesChart
                label={t('admin.analytics.dailyActive')}
                data={days}
                xKey="day"
                series={[
                  { key: 'current', label: t('admin.analytics.thisPeriod') },
                  { key: 'previous', label: t('admin.analytics.previousPeriod'), previous: true },
                ]}
                formatX={(value) => formatDate(locale, value)}
              />
              <p className="dt-cap">{t('admin.analytics.gapsSuppressed')}</p>
            </section>
          </div>
        );
      }}
    </Loading>
  );
}

function Library({ filter }: { filter: Filter }) {
  const { t, locale } = useI18n();
  const cell = useCellText();
  const query = useQuery({
    queryKey: ['admin', 'analytics', 'library', filter],
    queryFn: () => call(api.GET('/admin/v1/analytics/library', { params: { query: filter } })),
  });
  return (
    <Loading query={query}>
      {() => {
        const data = query.data!;
        return (
          <div className="dt-stack gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t('admin.analytics.searches')} value={cell(data.searches)} />
              <Metric
                label={t('admin.analytics.searchesWithoutResult')}
                value={cell(data.searchesWithoutResult)}
              />
            </div>
            <table className="dt-table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.analytics.model')}</th>
                  <th scope="col" className="r">
                    {t('admin.analytics.opens')}
                  </th>
                  <th scope="col" className="r">
                    {t('admin.analytics.views')}
                  </th>
                  <th scope="col" className="r">
                    {t('admin.analytics.offlineViews')}
                  </th>
                  <th scope="col" className="r">
                    {t('admin.analytics.favorites')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.models.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="dt-cap">
                      {t('admin.analytics.noActivity')}
                    </td>
                  </tr>
                ) : (
                  data.models.map((model) => (
                    <tr key={model.id}>
                      <td>
                        {(locale === 'en' ? model.titleEn : null) ?? model.titleFr ?? model.id}
                      </td>
                      <td className="r">{cell(model.opens)}</td>
                      <td className="r">{cell(model.views)}</td>
                      <td className="r">{cell(model.offlineViews)}</td>
                      <td className="r">{cell(model.favorites)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      }}
    </Loading>
  );
}

function Calculators({ filter }: { filter: Filter }) {
  const { t, locale } = useI18n();
  const cell = useCellText();
  const query = useQuery({
    queryKey: ['admin', 'analytics', 'calculators', filter],
    queryFn: () => call(api.GET('/admin/v1/analytics/calculators', { params: { query: filter } })),
  });
  return (
    <Loading query={query}>
      {() => {
        const rows = query.data!.rows;
        const chart = rows
          .filter((row) => row.starts !== null)
          .slice(0, 12)
          .map((row) => ({
            name: `${(locale === 'en' ? row.nameEn : row.nameFr) ?? row.id.slice(0, 8)} v${row.version ?? '?'}`,
            starts: row.starts,
            completions: row.completions,
          }));
        return (
          <div className="dt-stack gap-4">
            {chart.length > 0 ? (
              <section className="dt-card">
                <h2 className="dt-heading">{t('admin.analytics.startsVsCompletions')}</h2>
                <BarSeriesChart
                  label={t('admin.analytics.startsVsCompletions')}
                  data={chart}
                  xKey="name"
                  series={[
                    { key: 'starts', label: t('admin.analytics.starts') },
                    { key: 'completions', label: t('admin.analytics.completions') },
                  ]}
                />
              </section>
            ) : null}
            <table className="dt-table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.analytics.calculator')}</th>
                  <th scope="col">{t('admin.analytics.version')}</th>
                  <th scope="col" className="r">
                    {t('admin.analytics.starts')}
                  </th>
                  <th scope="col" className="r">
                    {t('admin.analytics.completions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="dt-cap">
                      {t('admin.analytics.noActivity')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={`${row.id}-${row.version}`}>
                      <td>{(locale === 'en' ? row.nameEn : row.nameFr) ?? row.id}</td>
                      <td>{row.version === null ? '—' : `v${row.version}`}</td>
                      <td className="r">{cell(row.starts)}</td>
                      <td className="r">{cell(row.completions)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      }}
    </Loading>
  );
}

function Onboarding({ filter }: { filter: Filter }) {
  const { t } = useI18n();
  const cell = useCellText();
  const query = useQuery({
    queryKey: ['admin', 'analytics', 'users', filter],
    queryFn: () => call(api.GET('/admin/v1/analytics/users', { params: { query: filter } })),
  });
  return (
    <Loading query={query}>
      {() => {
        const data = query.data!;
        return (
          <div className="dt-stack gap-3">
            <div className="grid grid-cols-4 gap-3">
              <Metric label={t('admin.analytics.signUps')} value={cell(data.signUps)} />
              <Metric label={t('admin.analytics.submitted')} value={cell(data.submitted)} />
              <Metric label={t('admin.analytics.verified')} value={cell(data.verified)} />
              <Metric label={t('admin.analytics.rejected')} value={cell(data.rejected)} />
            </div>
            <p className="dt-cap">{t('admin.analytics.funnelNote')}</p>
          </div>
        );
      }}
    </Loading>
  );
}

function Subscriptions({ filter }: { filter: Filter }) {
  const { t } = useI18n();
  const cell = useCellText();
  const query = useQuery({
    queryKey: ['admin', 'analytics', 'subscriptions', filter],
    queryFn: () =>
      call(api.GET('/admin/v1/analytics/subscriptions', { params: { query: filter } })),
  });
  return (
    <Loading query={query}>
      {() => {
        const data = query.data!;
        return (
          <div className="dt-stack gap-3">
            <Metric label={t('admin.analytics.planViews')} value={cell(data.planViews)} />
            <table className="dt-table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.plans.colCode')}</th>
                  <th scope="col" className="r">
                    {t('admin.finance.started')}
                  </th>
                  <th scope="col" className="r">
                    {t('admin.finance.renewed')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byPlan.map((row) => (
                  <tr key={row.planCode}>
                    <td className="dt-mono">{row.planCode}</td>
                    <td className="r">{cell(row.started)}</td>
                    <td className="r">{cell(row.renewed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dt-cap inline-flex items-center gap-1">
              <Info size={14} aria-hidden />
              {t('admin.analytics.moneyInFinance')}{' '}
              <Link href="/admin/finance">{t('admin.nav.finance')}</Link>
            </p>
          </div>
        );
      }}
    </Loading>
  );
}

function Demo({ filter }: { filter: Filter }) {
  const { t } = useI18n();
  const cell = useCellText();
  const query = useQuery({
    queryKey: ['admin', 'analytics', 'demo', filter],
    queryFn: () => call(api.GET('/admin/v1/analytics/demo', { params: { query: filter } })),
  });
  return (
    <Loading query={query}>
      {() => {
        const data = query.data!;
        return (
          <div className="dt-stack gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t('admin.analytics.demoStarted')} value={cell(data.started)} />
              <Metric label={t('admin.analytics.demoConverted')} value={cell(data.converted)} />
            </div>
            <table className="dt-table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.analytics.module')}</th>
                  <th scope="col" className="r">
                    {t('admin.analytics.viewed')}
                  </th>
                  <th scope="col" className="r">
                    {t('admin.analytics.limitsMet')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.modules.map((row) => (
                  <tr key={row.module}>
                    <td>
                      {row.module in DEMO_MODULES ? t(DEMO_MODULES[row.module]!) : row.module}
                    </td>
                    <td className="r">{cell(row.viewed)}</td>
                    <td className="r">{cell(row.limitsMet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dt-cap">{t('admin.analytics.demoNote')}</p>
          </div>
        );
      }}
    </Loading>
  );
}
