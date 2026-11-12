'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, Copy, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, PageHeader } from '@/ui/feedback';
import { Field, Select, TextInput } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { AdminDrawer } from './admin-drawer';
import { adminsKey, type Preset, PRESET_LABELS } from './grants';

/** One admin account. */
type Admin = Schemas['AdminAccountDto'];

/** « Permissions » (ScreenPermissions): admins, their presets and grants (section 03). */
export function PermissionsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // A one-time password to show once: of a new admin, or re-issued to an existing one.
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    reissued: boolean;
  } | null>(null);
  // Every admin with their grants.
  const admins = useQuery({
    queryKey: adminsKey,
    queryFn: () => call(api.GET('/admin/v1/admins')),
  });
  const open = admins.data?.find((admin) => admin.id === openId) ?? null;

  const columns = useMemo<Column<Admin>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.permissions.colName'),
        cell: (row) => (
          <div>
            <b>{row.fullName}</b>
            <div className="dt-cap">{row.email}</div>
          </div>
        ),
      },
      {
        id: 'preset',
        header: t('admin.permissions.colPreset'),
        cell: (row) =>
          row.preset ? (
            t(PRESET_LABELS[row.preset])
          ) : (
            <span className="dt-cap">{t('admin.permissions.custom')}</span>
          ),
      },
      {
        id: 'grants',
        header: t('admin.permissions.colGrants'),
        align: 'end',
        cell: (row) => row.grants.filter((grant) => grant.expiresAt === null).length,
      },
      {
        id: 'temporary',
        header: t('admin.permissions.colTemporary'),
        hideable: true,
        cell: (row) => {
          const temporary = row.grants.filter((grant) => grant.expiresAt !== null);
          return temporary.length === 0
            ? '—'
            : temporary.map((grant) => (
                <Badge key={grant.grant} tone="info">
                  {t('admin.permissions.until', { date: formatDateTime(locale, grant.expiresAt!) })}
                </Badge>
              ));
        },
      },
      {
        id: 'totp',
        header: t('admin.permissions.colTotp'),
        cell: (row) =>
          row.totpEnrolled ? (
            <Badge tone="success">
              <Check aria-hidden />
              {t('admin.permissions.totpOn')}
            </Badge>
          ) : (
            <Badge tone="neutral">{t('admin.permissions.totpPending')}</Badge>
          ),
      },
      {
        id: 'lastLogin',
        header: t('admin.permissions.colLastLogin'),
        hideable: true,
        cell: (row) => (row.lastLoginAt ? formatDateTime(locale, row.lastLoginAt) : '—'),
      },
      {
        id: 'status',
        header: t('admin.permissions.colStatus'),
        cell: (row) =>
          row.status === 'ACTIVE' ? (
            <Badge tone="neutral">{t('admin.users.active')}</Badge>
          ) : (
            <Badge tone="warning">{t('admin.users.suspended')}</Badge>
          ),
      },
    ],
    [t, locale],
  );

  return (
    <>
      <PageHeader
        title={t('admin.permissions.title')}
        caption={t('admin.permissions.caption')}
        actions={
          // « Nouvel administrateur ».
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            {t('admin.permissions.add')}
          </Button>
        }
      />
      {admins.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(admins.error)}
        </EmptyState>
      ) : (
        <DataTable
          label={t('admin.permissions.title')}
          columns={columns}
          rows={admins.data ?? []}
          rowId={(row) => row.id}
          loading={admins.isPending}
          selectedId={openId}
          onOpen={(row) => setOpenId(row.id)}
        />
      )}
      <AdminDrawer
        admin={open}
        onClose={() => setOpenId(null)}
        onPasswordIssued={(email, password) => setCreated({ email, password, reissued: true })}
      />
      {creating ? (
        <CreateAdminDialog
          onClose={() => setCreating(false)}
          onCreated={(email, password) => {
            setCreating(false);
            setCreated({ email, password, reissued: false });
          }}
        />
      ) : null}
      {created ? (
        <PasswordDialog
          email={created.email}
          password={created.password}
          reissued={created.reissued}
          onClose={() => setCreated(null)}
        />
      ) : null}
    </>
  );
}

const PRESETS = Object.keys(PRESET_LABELS) as Preset[];

/** New admin: e-mail, name and preset; the one-time password is then shown once. */
function CreateAdminDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [preset, setPreset] = useState<Preset>('VERIFICATION_REVIEWER');
  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && fullName.trim().length >= 2;
  return (
    <ReasonDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('admin.permissions.add')}
      description={t('admin.permissions.addBody')}
      confirmLabel={t('admin.permissions.create')}
      ready={ready}
      onConfirm={async (reason) => {
        const result = await call(
          api.POST('/admin/v1/admins', {
            body: { email: email.trim(), fullName: fullName.trim(), preset, reason },
          }),
        );
        await queryClient.invalidateQueries({ queryKey: adminsKey });
        onCreated(email.trim(), result.oneTimePassword);
      }}
    >
      <Field label={t('admin.permissions.email')} required>
        {({ inputId }) => (
          <TextInput
            id={inputId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('admin.permissions.fullName')}
        required
        help={t('admin.permissions.fullNameHelp')}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        )}
      </Field>
      <Field label={t('admin.permissions.colPreset')} required>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={preset}
            onChange={(event) => setPreset(event.target.value as Preset)}
          >
            {PRESETS.map((value) => (
              <option key={value} value={value}>
                {t(PRESET_LABELS[value])}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </ReasonDialog>
  );
}

/**
 * The one-time password, shown once. A new admin enrols TOTP at first sign-in; in both cases the
 * admin then replaces this password from their account menu.
 */
function PasswordDialog({
  email,
  password,
  reissued,
  onClose,
}: {
  email: string;
  password: string;
  /** Re-issued to an existing admin (their authenticator is unchanged). */
  reissued: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('admin.permissions.passwordTitle')}
      description={t(
        reissued ? 'admin.permissions.passwordResetBody' : 'admin.permissions.passwordBody',
        { email },
      )}
      footer={
        // « J'ai transmis le mot de passe »: closes; the password is never shown again.
        <Button variant="primary" onClick={onClose}>
          {t('admin.permissions.passwordDone')}
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <code className="dt-code flex-1 select-all">{password}</code>
        {/* Copies the one-time password to the clipboard. */}
        <Button
          icon
          aria-label={t('admin.permissions.copy')}
          onClick={() => {
            void navigator.clipboard
              .writeText(password)
              .then(() => toast(t('admin.permissions.copied')));
          }}
        >
          <Copy size={16} aria-hidden />
        </Button>
      </div>
      <Alert tone="warning">{t('admin.permissions.passwordOnce')}</Alert>
    </Dialog>
  );
}
