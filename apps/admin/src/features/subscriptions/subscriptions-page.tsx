'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call } from '@/api/client';
import { formatMoney } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { OverflowMenu } from '@/ui/menu';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { PlanDrawer } from './plan-drawer';
import { SubscriptionsList } from './subscriptions-list';
import type { Plan } from './plan-form';

const plansKey = ['admin', 'plans'] as const;

/** « Abonnements » — Offres (ScreenSubscriptionsAdmin): the versioned plan catalogue. */
export function SubscriptionsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const canWrite = has('subscriptions.plans.write');
  const [drawer, setDrawer] = useState<{ base: Plan | null } | null>(null);
  const [sale, setSale] = useState<Plan | null>(null);

  // Every version of every plan.
  const plans = useQuery({ queryKey: plansKey, queryFn: () => call(api.GET('/admin/v1/plans')) });
  // The latest version number of each plan code (only it can be the base of a new version).
  const latestByCode = useMemo(() => {
    const latest = new Map<string, number>();
    for (const plan of plans.data ?? [])
      latest.set(plan.code, Math.max(latest.get(plan.code) ?? 0, plan.version));
    return latest;
  }, [plans.data]);

  const columns = useMemo<Column<Plan>[]>(
    () => [
      {
        id: 'code',
        header: t('admin.plans.colCode'),
        cell: (row) => <span className="dt-mono">{row.code}</span>,
        sortValue: (row) => `${row.code}:${String(1e6 - row.version).padStart(7, '0')}`,
      },
      {
        id: 'name',
        header: t('admin.plans.colName'),
        cell: (row) => (locale === 'en' ? row.nameEn : row.nameFr),
      },
      {
        id: 'audience',
        header: t('admin.plans.colAudience'),
        hideable: true,
        cell: (row) =>
          row.audience
            .map((type) =>
              t(type === 'DOCTOR' ? 'admin.common.typeDoctor' : 'admin.common.typeResident'),
            )
            .join(' · '),
      },
      {
        id: 'price',
        header: t('admin.plans.colPrice'),
        align: 'end',
        cell: (row) => formatMoney(locale, row.priceMinor, row.currency),
        sortValue: (row) => row.priceMinor,
      },
      {
        id: 'duration',
        header: t('admin.plans.colDuration'),
        align: 'end',
        cell: (row) => t('admin.plans.durationDays', { days: row.durationDays }),
      },
      {
        id: 'version',
        header: t('admin.plans.colVersion'),
        align: 'end',
        cell: (row) => `v${row.version}`,
      },
      {
        id: 'sale',
        header: t('admin.plans.colSale'),
        cell: (row) =>
          row.isPurchasable ? (
            <Badge tone="success">{t('admin.plans.onSale')}</Badge>
          ) : (
            <Badge tone="neutral">{t('admin.plans.notOnSale')}</Badge>
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
                label: t('admin.plans.newVersion'),
                // « Nouvelle version » of this plan (a price change is a new version).
                onSelect: () => setDrawer({ base: row }),
                hidden: !canWrite || latestByCode.get(row.code) !== row.version,
              },
              {
                label: row.isPurchasable ? t('admin.plans.stopSale') : t('admin.plans.startSale'),
                // « Mettre en vente » / « Retirer de la vente ».
                onSelect: () => setSale(row),
                hidden: !canWrite,
              },
            ]}
          />
        ),
      },
    ],
    [t, locale, canWrite, latestByCode],
  );

  // After publishing: refresh the plans and confirm with a toast.
  const published = (plan: Plan, message: string) => {
    void queryClient.invalidateQueries({ queryKey: plansKey });
    toast(message);
    return plan;
  };

  return (
    <>
      <PageHeader
        title={t('admin.plans.title')}
        caption={t('admin.plans.caption')}
        actions={
          canWrite ? (
            // « Nouveau forfait ».
            <Button variant="primary" onClick={() => setDrawer({ base: null })}>
              <Plus size={16} aria-hidden />
              {t('admin.plans.add')}
            </Button>
          ) : null
        }
      />
      <Tabs defaultValue="plans" className="dt-stack">
        <TabList label={t('admin.plans.title')}>
          <Tab value="plans">{t('admin.plans.tabPlans')}</Tab>
          <Tab value="subscriptions">{t('admin.plans.tabSubscriptions')}</Tab>
        </TabList>
        <TabPanel value="plans">
          {plans.isError ? (
            <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
              {errorText(plans.error)}
            </EmptyState>
          ) : (
            <DataTable
              label={t('admin.plans.tabPlans')}
              columns={columns}
              rows={plans.data ?? []}
              rowId={(row) => row.id}
              loading={plans.isPending}
              empty={
                <EmptyState icon={Plus} title={t('admin.plans.empty')}>
                  {t('admin.plans.emptyBody')}
                </EmptyState>
              }
            />
          )}
        </TabPanel>
        <TabPanel value="subscriptions">
          <SubscriptionsList />
        </TabPanel>
      </Tabs>
      <p className="dt-cap">{t('admin.plans.noRefund')}</p>
      <PlanDrawer
        base={drawer?.base ?? null}
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        onPublished={(plan) => {
          setDrawer(null);
          published(plan, t('admin.plans.published', { code: plan.code, version: plan.version }));
        }}
      />
      <ReasonDialog
        open={sale !== null}
        onOpenChange={(open) => (open ? undefined : setSale(null))}
        title={
          sale?.isPurchasable ? t('admin.plans.stopSaleTitle') : t('admin.plans.startSaleTitle')
        }
        description={
          sale?.isPurchasable ? t('admin.plans.stopSaleBody') : t('admin.plans.startSaleBody')
        }
        confirmLabel={sale?.isPurchasable ? t('admin.plans.stopSale') : t('admin.plans.startSale')}
        confirmVariant={sale?.isPurchasable ? 'danger' : 'primary'}
        onConfirm={async (reason) => {
          if (!sale) return;
          const next = await call(
            api.POST('/admin/v1/plans/{id}/sale', {
              params: { path: { id: sale.id } },
              body: { isPurchasable: !sale.isPurchasable, reason },
            }),
          );
          published(next, t('admin.plans.saleChanged'));
        }}
      />
    </>
  );
}
