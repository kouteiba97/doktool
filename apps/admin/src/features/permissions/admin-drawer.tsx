'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { type Grant, useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Drawer } from '@/ui/drawer';
import { Alert } from '@/ui/feedback';
import { Field, Select, Switch } from '@/ui/field';
import { OverflowMenu } from '@/ui/menu';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { adminsKey, GRANT_GROUPS, GRANT_LABELS, PRESET_LABELS, separationProblems } from './grants';

/** One admin account. */
type Admin = Schemas['AdminAccountDto'];
/** Which dialog is open. */
type Action = 'save' | 'temporary' | 'suspend' | 'reinstate' | 'resetTotp' | null;

const TEMPORARY_HOURS = [1, 2, 4, 8] as const;

/** One admin: effective grants with their origin, temporary access, status and TOTP (section 07). */
export function AdminDrawer({ admin, onClose }: { admin: Admin | null; onClose: () => void }) {
  return admin ? <AdminDrawerBody key={admin.id} admin={admin} onClose={onClose} /> : null;
}

/** The drawer's content: the grants by area, with the separation-of-duties rules checked live. */
function AdminDrawerBody({ admin, onClose }: { admin: Admin; onClose: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useGrants();
  const self = me?.id === admin.id;
  // The admin's permanent grants (temporary ones expire on their own).
  const permanent = useMemo(
    () =>
      admin.grants.filter((grant) => grant.expiresAt === null).map((grant) => grant.grant as Grant),
    [admin.grants],
  );
  const temporary = admin.grants.filter((grant) => grant.expiresAt !== null);
  const [grants, setGrants] = useState<Grant[]>(permanent);
  const [action, setAction] = useState<Action>(null);
  const [hours, setHours] = useState<number>(2);
  const dirty = JSON.stringify([...grants].sort()) !== JSON.stringify([...permanent].sort());
  const problems = separationProblems(grants);

  // After an action: reload the admins and confirm with a toast.
  const done = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: adminsKey });
    toast(message);
  };
  // Ticks or unticks one grant (not saved yet).
  const toggle = (grant: Grant, on: boolean) =>
    setGrants((current) =>
      on ? [...new Set([...current, grant])] : current.filter((item) => item !== grant),
    );
  const path = { params: { path: { id: admin.id } } };

  return (
    <Drawer
      open
      onClose={onClose}
      mode="edit"
      dirty={dirty}
      title={admin.fullName}
      caption={admin.email}
      status={
        admin.status === 'SUSPENDED' ? (
          <Badge tone="warning">{t('admin.users.suspended')}</Badge>
        ) : null
      }
      footer={
        self ? null : (
          <>
            <OverflowMenu
              label={t('admin.common.moreActions')}
              actions={[
                // « Accès temporaire »: a grant that ends after a few hours.
                { label: t('admin.permissions.temporary'), onSelect: () => setAction('temporary') },
                // « Réinitialiser l'authentificateur »: lost phone; enrols again at next sign-in.
                { label: t('admin.permissions.resetTotp'), onSelect: () => setAction('resetTotp') },
                {
                  label: t('admin.permissions.suspend'),
                  // « Suspendre »: blocks sign-in and ends sessions.
                  onSelect: () => setAction('suspend'),
                  hidden: admin.status !== 'ACTIVE',
                  danger: true,
                },
                {
                  label: t('admin.permissions.reinstate'),
                  // « Réactiver ».
                  onSelect: () => setAction('reinstate'),
                  hidden: admin.status !== 'SUSPENDED',
                },
              ]}
            />
            <div className="end">
              {/* « Enregistrer les permissions »: needs a change that breaks no separation rule. */}
              <Button
                variant="primary"
                disabled={!dirty || problems.length > 0}
                onClick={() => setAction('save')}
              >
                {t('admin.permissions.saveGrants')}
              </Button>
            </div>
          </>
        )
      }
    >
      {self ? <Alert tone="info">{t('admin.permissions.selfNotice')}</Alert> : null}
      <dl className="dt-dl">
        <dt>{t('admin.permissions.colPreset')}</dt>
        <dd>{admin.preset ? t(PRESET_LABELS[admin.preset]) : t('admin.permissions.custom')}</dd>
        <dt>{t('admin.permissions.colTotp')}</dt>
        <dd>
          {admin.totpEnrolled ? t('admin.permissions.totpOn') : t('admin.permissions.totpPending')}
        </dd>
        <dt>{t('admin.permissions.colLastLogin')}</dt>
        <dd>{admin.lastLoginAt ? formatDateTime(locale, admin.lastLoginAt) : '—'}</dd>
      </dl>
      {temporary.length > 0 ? (
        <section className="dt-stack">
          <h3 className="dt-heading">{t('admin.permissions.colTemporary')}</h3>
          {temporary.map((grant) => (
            <div key={grant.grant} className="dt-row-flex">
              <Badge tone="info">
                {t('admin.permissions.until', { date: formatDateTime(locale, grant.expiresAt!) })}
              </Badge>
              {grant.grant in GRANT_LABELS ? t(GRANT_LABELS[grant.grant as Grant]) : grant.grant}
              {grant.grantedBy ? (
                <span className="dt-cap">
                  {t('admin.permissions.grantedBy', { name: grant.grantedBy.fullName })}
                </span>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      {problems.map((problem) => (
        <Alert key={problem} tone="warning">
          {t(problem)}
        </Alert>
      ))}
      {GRANT_GROUPS.map((group) => (
        <fieldset key={group.domain} className="dt-stack gap-1">
          <legend className="dt-label">{t(group.label)}</legend>
          {group.grants.map((grant) => (
            <div key={grant} className="dt-row-flex justify-between">
              <Switch
                checked={grants.includes(grant)}
                disabled={self}
                onChange={(on) => toggle(grant, on)}
                label={t(GRANT_LABELS[grant])}
              />
              <code className="dt-mono dt-cap">{grant}</code>
            </div>
          ))}
        </fieldset>
      ))}

      <ReasonDialog
        open={action === 'save'}
        onOpenChange={(open) => setAction(open ? 'save' : null)}
        title={t('admin.permissions.saveTitle')}
        description={t('admin.permissions.saveBody')}
        confirmLabel={t('admin.permissions.saveGrants')}
        onConfirm={async (reason) => {
          await call(
            api.PUT('/admin/v1/admins/{id}/grants', { ...path, body: { grants, reason } }),
          );
          await done(t('admin.permissions.saved'));
        }}
      />
      <ReasonDialog
        open={action === 'temporary'}
        onOpenChange={(open) => setAction(open ? 'temporary' : null)}
        title={t('admin.permissions.temporary')}
        description={t('admin.permissions.temporaryBody')}
        confirmLabel={t('admin.permissions.grantAccess')}
        onConfirm={async (reason) => {
          await call(
            api.POST('/admin/v1/admins/{id}/temporary-grants', {
              ...path,
              body: { grant: 'verification.documents.view', hours, reason },
            }),
          );
          await done(t('admin.permissions.temporaryGranted'));
        }}
      >
        <Field label={t('admin.permissions.duration')} required>
          {({ inputId }) => (
            <Select
              id={inputId}
              value={String(hours)}
              onChange={(event) => setHours(Number(event.target.value))}
            >
              {TEMPORARY_HOURS.map((value) => (
                <option key={value} value={value}>
                  {t('admin.permissions.hours', { hours: value })}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </ReasonDialog>
      <ReasonDialog
        open={action === 'suspend'}
        onOpenChange={(open) => setAction(open ? 'suspend' : null)}
        title={t('admin.permissions.suspendTitle')}
        description={t('admin.permissions.suspendBody')}
        confirmLabel={t('admin.permissions.suspend')}
        confirmVariant="danger"
        onConfirm={async (reason) => {
          await call(api.POST('/admin/v1/admins/{id}/suspend', { ...path, body: { reason } }));
          await done(t('admin.permissions.suspended'));
        }}
      />
      <ReasonDialog
        open={action === 'reinstate'}
        onOpenChange={(open) => setAction(open ? 'reinstate' : null)}
        title={t('admin.permissions.reinstateTitle')}
        confirmLabel={t('admin.permissions.reinstate')}
        onConfirm={async (reason) => {
          await call(api.POST('/admin/v1/admins/{id}/reinstate', { ...path, body: { reason } }));
          await done(t('admin.permissions.reinstated'));
        }}
      />
      <ReasonDialog
        open={action === 'resetTotp'}
        onOpenChange={(open) => setAction(open ? 'resetTotp' : null)}
        title={t('admin.permissions.resetTotpTitle')}
        description={t('admin.permissions.resetTotpBody')}
        confirmLabel={t('admin.permissions.resetTotp')}
        confirmVariant="danger"
        onConfirm={async (reason) => {
          await call(api.POST('/admin/v1/admins/{id}/reset-totp', { ...path, body: { reason } }));
          await done(t('admin.permissions.totpReset'));
        }}
      />
    </Drawer>
  );
}
