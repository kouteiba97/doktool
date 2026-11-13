'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Clock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api, call } from '@/api/client';
import { formatAge, formatDateTime, formatMoney, formatNumber, hoursSince } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader, Skeleton } from '@/ui/feedback';
import { Metric, useCellText } from '@/ui/metric';
import { TYPE_LABELS } from '../verification/labels';
import { actionLabel } from '../audit/audit-labels';

/** « Vue d'ensemble » (ScreenAdminOverview): one ledger strip, then three work lists — no KPI wall. */
export function OverviewPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const cell = useCellText();
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => call(api.GET('/admin/v1/overview')),
    refetchInterval: 60_000,
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
  // The ledger strip: only the figures this admin's grants allow (the API leaves the others out).
  const strip: ReactNode[] = [];
  if ('activeUsers30d' in data) {
    strip.push(
      <Metric
        key="active"
        label={t('admin.overview.activeUsers')}
        value={cell(data.activeUsers30d)}
      />,
    );
  }
  if (data.pendingVerifications !== undefined) {
    strip.push(
      <Metric
        key="pending"
        label={t('admin.overview.pendingVerifications')}
        value={formatNumber(locale, data.pendingVerifications)}
        note={t('admin.overview.slaBreaches', {
          count: data.slaBreaches ?? 0,
          hours: data.slaHours,
        })}
      />,
    );
  }
  if (data.payingProfessionals !== undefined) {
    strip.push(
      <Metric
        key="paying"
        label={t('admin.overview.payingProfessionals')}
        value={formatNumber(locale, data.payingProfessionals)}
      />,
    );
  }
  if (data.netRevenue30dMinor !== undefined) {
    strip.push(
      <Metric
        key="net"
        label={t('admin.overview.netRevenue')}
        value={formatMoney(locale, data.netRevenue30dMinor, 'DZD')}
      />,
    );
  }

  // Number of incidents shown in the middle column.
  const incidents =
    (data.fileFailures?.length ?? 0) +
    (data.failedPayments30d ?? 0) +
    (data.stalePendingPayments ?? 0);

  return (
    <>
      <PageHeader title={t('admin.overview.title')} />
      {strip.length > 0 ? <div className="grid grid-cols-4 gap-3">{strip}</div> : null}
      <div className="grid grid-cols-3 gap-4">
        <section className="dt-card" aria-labelledby="to-do">
          <h2 id="to-do" className="dt-heading">
            {t('admin.overview.toDo')}
          </h2>
          {data.oldestCases === undefined && data.versionsToReview === undefined ? (
            <p className="dt-cap">{t('admin.overview.nothingForYou')}</p>
          ) : null}
          {data.oldestCases && data.oldestCases.length > 0 ? (
            <ul className="dt-stack gap-2">
              {data.oldestCases.map((item) => {
                const late =
                  item.waitingSince !== null && hoursSince(item.waitingSince) >= data.slaHours;
                return (
                  <li key={item.id} className="dt-row-flex justify-between">
                    <Link href="/admin/verification" className="min-w-0">
                      <b>{item.personName}</b>
                      <span className="dt-cap">
                        {' · '}
                        {item.type in TYPE_LABELS
                          ? t(TYPE_LABELS[item.type as keyof typeof TYPE_LABELS])
                          : item.type}
                      </span>
                    </Link>
                    {item.waitingSince ? (
                      <Badge tone={late ? 'warning' : 'neutral'}>
                        {late ? <Clock aria-hidden /> : null}
                        {late
                          ? t('admin.verification.slaLate', {
                              age: formatAge(locale, item.waitingSince),
                            })
                          : formatAge(locale, item.waitingSince)}
                      </Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : data.oldestCases ? (
            <p className="dt-cap">{t('admin.overview.noCases')}</p>
          ) : null}
          {data.versionsToReview && data.versionsToReview.length > 0 ? (
            <ul className="dt-stack gap-2">
              {data.versionsToReview.map((version) => (
                <li key={version.versionId}>
                  <Link href={`/admin/calculators/${version.calculatorId}`}>
                    <b>{locale === 'en' ? version.nameEn : version.nameFr}</b>
                    <span className="dt-cap">
                      {' '}
                      · {t('admin.overview.versionToReview', { version: version.version })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="dt-card" aria-labelledby="incidents">
          <h2 id="incidents" className="dt-heading">
            {t('admin.overview.incidents')}
          </h2>
          {incidents === 0 ? <p className="dt-cap">{t('admin.overview.noIncidents')}</p> : null}
          {data.failedPayments30d ? (
            <Link href="/admin/transactions" className="dt-row-flex">
              <Badge tone="warning">{formatNumber(locale, data.failedPayments30d)}</Badge>
              {t('admin.overview.failedPayments')}
            </Link>
          ) : null}
          {data.stalePendingPayments ? (
            <Link href="/admin/transactions" className="dt-row-flex">
              <Badge tone="warning">{formatNumber(locale, data.stalePendingPayments)}</Badge>
              {t('admin.overview.stalePayments')}
            </Link>
          ) : null}
          {data.fileFailures?.map((file) => (
            <Link
              key={`${file.documentId}-${file.version}`}
              href={`/admin/library/${file.type === 'CERTIFICATE' ? 'certificates' : 'ordonnances'}`}
              className="dt-row-flex"
            >
              <Badge tone="critical">{t('admin.library.fileFailed')}</Badge>
              {file.titleFr} <span className="dt-cap">v{file.version}</span>
            </Link>
          ))}
        </section>

        <section className="dt-card" aria-labelledby="changes">
          <h2 id="changes" className="dt-heading">
            {t('admin.overview.latestChanges')}
          </h2>
          {data.latestChanges && data.latestChanges.length > 0 ? (
            <ul className="dt-stack gap-2">
              {data.latestChanges.map((entry) => (
                <li key={entry.id} className="dt-stack gap-0">
                  <span>{actionLabel(t, entry.action)}</span>
                  <span className="dt-cap">
                    {entry.actorName ??
                      (entry.actorType === 'SYSTEM' ? t('admin.audit.actorSystem') : '—')}{' '}
                    · {formatDateTime(locale, entry.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dt-cap">{t('admin.overview.noChanges')}</p>
          )}
        </section>
      </div>
    </>
  );
}
