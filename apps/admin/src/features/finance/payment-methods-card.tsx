'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { EmptyState } from '@/ui/feedback';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { PROVIDER_LABELS } from '../subscriptions/labels';

type Route = Schemas['PaymentMethodRouteDto'];

export const METHOD_LABELS: Record<Schemas['PaymentMethod'], MessageKey> = {
  CIB: 'admin.paymentMethods.cib',
  EDAHABIA: 'admin.paymentMethods.edahabia',
};

/**
 * « Moyens de paiement » (ADR-021): the gateway that takes each card, configured on the server,
 * and the switch that pauses a card in the app while its network is down.
 */
export function PaymentMethodsCard() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const canSwitch = has('subscriptions.plans.write');
  const [switching, setSwitching] = useState<Route | null>(null);

  const routes = useQuery({
    queryKey: ['admin', 'payment-methods'],
    queryFn: () => call(api.GET('/admin/v1/payment-methods')),
  });

  return (
    <section className="dt-card">
      <h2 className="dt-heading">{t('admin.paymentMethods.title')}</h2>
      <p className="dt-cap">{t('admin.paymentMethods.help')}</p>
      {routes.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(routes.error)}
        </EmptyState>
      ) : (
        <ul className="dt-stack gap-2">
          {(routes.data ?? []).map((route) => (
            <li key={route.method} className="dt-row-flex justify-between">
              <span className="dt-row-flex gap-2">
                <b>{t(METHOD_LABELS[route.method])}</b>
                {route.channel ? (
                  <span className="dt-cap">
                    {t('admin.paymentMethods.via', { channel: t(PROVIDER_LABELS[route.channel]) })}
                  </span>
                ) : (
                  <Badge tone="warning">{t('admin.paymentMethods.noGateway')}</Badge>
                )}
                {route.enabled ? (
                  <Badge tone="success">{t('admin.paymentMethods.offered')}</Badge>
                ) : (
                  <Badge tone="neutral">{t('admin.paymentMethods.paused')}</Badge>
                )}
              </span>
              {canSwitch && route.gateway ? (
                <Button size="sm" variant="ghost" onClick={() => setSwitching(route)}>
                  {route.enabled
                    ? t('admin.paymentMethods.pause')
                    : t('admin.paymentMethods.resume')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog
        open={switching !== null}
        onOpenChange={(open) => (open ? undefined : setSwitching(null))}
        title={
          switching
            ? t(
                switching.enabled
                  ? 'admin.paymentMethods.pauseTitle'
                  : 'admin.paymentMethods.resumeTitle',
                { method: t(METHOD_LABELS[switching.method]) },
              )
            : null
        }
        description={
          switching?.enabled
            ? t('admin.paymentMethods.pauseBody')
            : t('admin.paymentMethods.resumeBody')
        }
        confirmLabel={
          switching?.enabled ? t('admin.paymentMethods.pause') : t('admin.paymentMethods.resume')
        }
        onConfirm={async (reason) => {
          if (!switching) return;
          await call(
            api.PUT('/admin/v1/payment-methods/{method}', {
              params: { path: { method: switching.method } },
              body: { enabled: !switching.enabled, reason },
            }),
          );
          setSwitching(null);
          await queryClient.invalidateQueries({ queryKey: ['admin', 'payment-methods'] });
          toast(t('admin.paymentMethods.saved'));
        }}
      />
    </section>
  );
}
