'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, Lock } from 'lucide-react';
import { useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDate, formatDateTime, formatNumber } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { OverflowMenu } from '@/ui/menu';
import { ReasonDialog } from '@/ui/reason-dialog';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import { AuditHistory } from '../audit/audit-history';
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_TONES } from '../subscriptions/labels';
import { PROFESSIONAL_TYPE_LABELS, STATUS_LABELS, STATUS_TONES } from '../verification/labels';
import {
  ACTIVITY_KIND_LABELS,
  FAVORITE_TYPE_LABELS,
  FEATURE_LABELS,
  LOCK_REASON_LABELS,
  TIER_LABELS,
} from './labels';
import { usersKey } from './labels';

type Detail = Schemas['AdminUserDetailDto'];
type Action = 'suspend' | 'reinstate' | 'signOut' | null;

/** User drawer: Profil · Accès · Abonnement · Activité · Historique (section 07); no documents. */
export function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const [action, setAction] = useState<Action>(null);
  const key = ['admin', 'users', 'detail', userId ?? ''] as const;
  const detail = useQuery({
    queryKey: key,
    queryFn: () =>
      call(api.GET('/admin/v1/users/{id}', { params: { path: { id: userId ?? '' } } })),
    enabled: userId !== null,
  });
  const user = detail.data;

  const refresh = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: usersKey });
    toast(message);
  };

  return (
    <Drawer
      open={userId !== null}
      onClose={onClose}
      mode="inspect"
      title={user ? `${user.firstName} ${user.lastName}` : t('admin.users.user')}
      caption={user ? <span className="dt-mono">{user.id}</span> : null}
      status={
        user?.status === 'SUSPENDED' ? (
          <Badge tone="warning">{t('admin.users.suspended')}</Badge>
        ) : null
      }
      footer={
        user ? (
          <OverflowMenu
            label={t('admin.common.moreActions')}
            actions={[
              {
                label: t('admin.users.suspend'),
                onSelect: () => setAction('suspend'),
                hidden: !has('users.suspend') || user.status !== 'ACTIVE',
                danger: true,
              },
              {
                label: t('admin.users.reinstate'),
                onSelect: () => setAction('reinstate'),
                hidden: !has('users.suspend') || user.status !== 'SUSPENDED',
              },
              {
                label: t('admin.users.signOut'),
                onSelect: () => setAction('signOut'),
                hidden: !has('users.write'),
              },
            ]}
          />
        ) : null
      }
    >
      {detail.isPending ? (
        <Skeleton lines={8} />
      ) : detail.isError || !user ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(detail.error)}
        </EmptyState>
      ) : (
        <>
          <Tabs defaultValue="profile" className="dt-stack">
            <TabList label={t('admin.users.user')}>
              <Tab value="profile">{t('admin.users.tabProfile')}</Tab>
              <Tab value="access">{t('admin.users.tabAccess')}</Tab>
              <Tab value="subscription">{t('admin.users.tabSubscription')}</Tab>
              <Tab value="activity">{t('admin.users.tabActivity')}</Tab>
              <Tab value="history">{t('admin.users.tabHistory')}</Tab>
            </TabList>
            <TabPanel value="profile">
              <Profile user={user} />
            </TabPanel>
            <TabPanel value="access">
              <Access user={user} />
            </TabPanel>
            <TabPanel value="subscription">
              <Subscriptions user={user} />
            </TabPanel>
            <TabPanel value="activity">
              <Activity user={user} />
            </TabPanel>
            <TabPanel value="history">
              <AuditHistory entries={user.history} />
            </TabPanel>
          </Tabs>
          <ReasonDialog
            open={action === 'suspend'}
            onOpenChange={(open) => setAction(open ? 'suspend' : null)}
            title={t('admin.users.suspendTitle')}
            description={t('admin.users.suspendBody')}
            confirmLabel={t('admin.users.suspend')}
            confirmVariant="danger"
            onConfirm={async (reason) => {
              await call(
                api.POST('/admin/v1/users/{id}/suspend', {
                  params: { path: { id: user.id } },
                  body: { reason },
                }),
              );
              await refresh(t('admin.users.suspended'));
            }}
          />
          <ReasonDialog
            open={action === 'reinstate'}
            onOpenChange={(open) => setAction(open ? 'reinstate' : null)}
            title={t('admin.users.reinstateTitle')}
            description={t('admin.users.reinstateBody')}
            confirmLabel={t('admin.users.reinstate')}
            onConfirm={async (reason) => {
              await call(
                api.POST('/admin/v1/users/{id}/reinstate', {
                  params: { path: { id: user.id } },
                  body: { reason },
                }),
              );
              await refresh(t('admin.users.reinstated'));
            }}
          />
          <ReasonDialog
            open={action === 'signOut'}
            onOpenChange={(open) => setAction(open ? 'signOut' : null)}
            title={t('admin.users.signOutTitle')}
            description={t('admin.users.signOutBody')}
            confirmLabel={t('admin.users.signOut')}
            onConfirm={async (reason) => {
              await call(
                api.POST('/admin/v1/users/{id}/sign-out', {
                  params: { path: { id: user.id } },
                  body: { reason },
                }),
              );
              await refresh(t('admin.users.signedOut'));
            }}
          />
        </>
      )}
    </Drawer>
  );
}

function Profile({ user }: { user: Detail }) {
  const { t, locale } = useI18n();
  return (
    <dl className="dt-dl">
      <dt>{t('admin.verification.fieldEmail')}</dt>
      <dd>{user.email ?? '—'}</dd>
      <dt>{t('admin.verification.fieldPhone')}</dt>
      <dd className="dt-mono">{user.phone ?? '—'}</dd>
      <dt>{t('admin.verification.fieldWilaya')}</dt>
      <dd>
        {user.wilaya.code} · {user.wilaya.name}
      </dd>
      <dt>{t('admin.verification.fieldProfessionalType')}</dt>
      <dd>{user.professionalType ? t(PROFESSIONAL_TYPE_LABELS[user.professionalType]) : '—'}</dd>
      {user.specialty ? (
        <>
          <dt>{t('admin.verification.fieldSpecialty')}</dt>
          <dd>{user.specialty[locale]}</dd>
        </>
      ) : null}
      {user.institution ? (
        <>
          <dt>{t('admin.verification.fieldInstitution')}</dt>
          <dd>{user.institution}</dd>
        </>
      ) : null}
      {user.residencyYear ? (
        <>
          <dt>{t('admin.verification.fieldResidencyYear')}</dt>
          <dd>{user.residencyYear}</dd>
        </>
      ) : null}
      {user.university ? (
        <>
          <dt>{t('admin.verification.fieldUniversity')}</dt>
          <dd>{user.university}</dd>
        </>
      ) : null}
      {user.academicYear ? (
        <>
          <dt>{t('admin.verification.fieldAcademicYear')}</dt>
          <dd>{user.academicYear}</dd>
        </>
      ) : null}
      {user.orderNumberMasked ? (
        <>
          <dt>{t('admin.verification.fieldOrderNumber')}</dt>
          <dd className="dt-mono">{user.orderNumberMasked}</dd>
        </>
      ) : null}
      <dt>{t('admin.users.language')}</dt>
      <dd>{user.language ?? '—'}</dd>
      <dt>{t('admin.verification.fieldAccountCreated')}</dt>
      <dd>{formatDate(locale, user.createdAt)}</dd>
      <dt>{t('admin.users.colLastSeen')}</dt>
      <dd>{user.lastSeenAt ? formatDateTime(locale, user.lastSeenAt) : '—'}</dd>
    </dl>
  );
}

/** The derived AccessProfile and its five inputs, read-only (section 27). */
function Access({ user }: { user: Detail }) {
  const { t, locale } = useI18n();
  const inputs = user.accessInputs;
  return (
    <div className="dt-stack gap-4">
      <div className="dt-row-flex">
        <span className="dt-label">{t('admin.users.tier')}</span>
        <Badge tone="brand">{t(TIER_LABELS[user.access.tier])}</Badge>
      </div>
      <section className="dt-stack">
        <h3 className="dt-heading">{t('admin.users.inputs')}</h3>
        <dl className="dt-dl">
          <dt>{t('admin.users.inputAccount')}</dt>
          <dd>
            {inputs.accountStatus === 'SUSPENDED'
              ? t('admin.users.suspended')
              : t('admin.users.active')}
          </dd>
          <dt>{t('admin.users.inputType')}</dt>
          <dd>
            {inputs.professionalType ? t(PROFESSIONAL_TYPE_LABELS[inputs.professionalType]) : '—'}
          </dd>
          <dt>{t('admin.users.colIdentity')}</dt>
          <dd>
            <Badge tone={STATUS_TONES[inputs.verification.identity]}>
              {t(STATUS_LABELS[inputs.verification.identity])}
            </Badge>
          </dd>
          <dt>{t('admin.users.colStatus')}</dt>
          <dd className="dt-row-flex">
            <Badge tone={STATUS_TONES[inputs.verification.status]}>
              {t(STATUS_LABELS[inputs.verification.status])}
            </Badge>
            {inputs.verification.statusExpiresAt ? (
              <span className="dt-cap">
                {t('admin.users.until', {
                  date: formatDate(locale, inputs.verification.statusExpiresAt),
                })}
              </span>
            ) : null}
          </dd>
          <dt>{t('admin.users.colSubscription')}</dt>
          <dd className="dt-row-flex">
            {inputs.subscriptionStatus ? (
              <Badge tone={SUBSCRIPTION_STATUS_TONES[inputs.subscriptionStatus]}>
                {t(SUBSCRIPTION_STATUS_LABELS[inputs.subscriptionStatus])}
              </Badge>
            ) : (
              '—'
            )}
            {inputs.subscriptionEndsAt ? (
              <span className="dt-cap">
                {t('admin.users.until', { date: formatDate(locale, inputs.subscriptionEndsAt) })}
              </span>
            ) : null}
          </dd>
        </dl>
      </section>
      <section className="dt-stack">
        <h3 className="dt-heading">{t('admin.users.features')}</h3>
        <ul className="dt-stack gap-1">
          {user.access.features.map((feature) => (
            <li key={feature.key} className="dt-row-flex">
              {feature.state === 'AVAILABLE' ? (
                <Badge tone="success">
                  <Check aria-hidden />
                  {feature.readOnly ? t('admin.users.readOnly') : t('admin.users.available')}
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <Lock aria-hidden />
                  {feature.lockReason
                    ? t(LOCK_REASON_LABELS[feature.lockReason])
                    : t('admin.users.locked')}
                </Badge>
              )}
              {t(FEATURE_LABELS[feature.key])}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Subscriptions({ user }: { user: Detail }) {
  const { t, locale } = useI18n();
  if (user.subscriptions === undefined)
    return <p className="dt-cap">{t('admin.users.subscriptionsGrant')}</p>;
  if (user.subscriptions.length === 0)
    return <p className="dt-cap">{t('admin.users.noSubscription')}</p>;
  return (
    <ul className="dt-stack gap-2">
      {user.subscriptions.map((subscription) => (
        <li key={subscription.id} className="dt-card gap-1 p-3">
          <div className="dt-row-flex">
            <b>{locale === 'en' ? subscription.plan.nameEn : subscription.plan.nameFr}</b>
            <span className="dt-mono dt-cap">
              {subscription.plan.code} v{subscription.plan.version}
            </span>
            <Badge tone={SUBSCRIPTION_STATUS_TONES[subscription.status]}>
              {t(SUBSCRIPTION_STATUS_LABELS[subscription.status])}
            </Badge>
          </div>
          <span className="dt-cap">
            {subscription.currentPeriodStart
              ? formatDate(locale, subscription.currentPeriodStart)
              : '—'}{' '}
            →{' '}
            {subscription.currentPeriodEnd
              ? formatDate(locale, subscription.currentPeriodEnd)
              : '—'}
          </span>
          {subscription.lastTransaction ? (
            <span className="dt-cap">
              {t('admin.users.lastPayment')}{' '}
              <span className="dt-mono">{subscription.lastTransaction.transactionId}</span>
            </span>
          ) : null}
        </li>
      ))}
      <li className="dt-cap">{t('admin.plans.noRefund')}</li>
    </ul>
  );
}

/** Counts by module only — never which searches, models or calculators (section 07). */
function Activity({ user }: { user: Detail }) {
  const { t, locale } = useI18n();
  return (
    <div className="dt-stack gap-4">
      <p className="dt-cap">{t('admin.users.activityPrivacy')}</p>
      <dl className="dt-dl">
        {user.activity.favorites.map((row) => (
          <div key={row.targetType} className="contents">
            <dt>{t(FAVORITE_TYPE_LABELS[row.targetType])}</dt>
            <dd>{formatNumber(locale, row.count)}</dd>
          </div>
        ))}
        {user.activity.history.map((row) => (
          <div key={row.kind} className="contents">
            <dt>{t(ACTIVITY_KIND_LABELS[row.kind])}</dt>
            <dd>{formatNumber(locale, row.count)}</dd>
          </div>
        ))}
      </dl>
      {user.activity.favorites.length === 0 && user.activity.history.length === 0 ? (
        <p className="dt-cap">{t('admin.users.noActivity')}</p>
      ) : null}
    </div>
  );
}
