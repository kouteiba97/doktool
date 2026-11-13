'use client';

import { useState } from 'react';
import { api, ApiFailure, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Field, TextInput } from '@/ui/field';
import { useToast } from '@/ui/toast';

/** The API's minimum for an admin password (ADMIN_PASSWORD_MIN_LENGTH). */
export const PASSWORD_MIN_LENGTH = 12;

/** Which rule a new password breaks, if any; checked again by the API. */
export function newPasswordProblem(
  current: string,
  next: string,
  confirmation: string,
): 'short' | 'same' | 'mismatch' | null {
  if (next.length < PASSWORD_MIN_LENGTH) return 'short';
  if (next === current) return 'same';
  if (next !== confirmation) return 'mismatch';
  return null;
}

/**
 * « Changer le mot de passe » of the account menu: the signed-in admin replaces the password they
 * were handed. The current password is asked again; the API then closes their other sessions.
 */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ field: 'current' | 'form'; text: string } | null>(null);
  // Errors of the new password appear once something was typed in the field they concern.
  const problem = newPasswordProblem(current, next, confirmation);
  const ready = current.length > 0 && problem === null;

  // Sends the change; a wrong current password is shown under its field.
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await call(
        api.POST('/admin/v1/auth/password', {
          body: { currentPassword: current, newPassword: next },
        }),
      );
      toast(t('admin.password.changed'));
      onClose();
    } catch (error) {
      setFailure(
        error instanceof ApiFailure && error.code === 'INVALID_CREDENTIALS'
          ? { field: 'current', text: t('admin.password.wrongCurrent') }
          : { field: 'form', text: errorText(error) },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('admin.password.title')}
      description={t('admin.password.body')}
      onSubmit={() => void submit()}
      footer={
        <>
          {/* « Annuler »: closes without changing anything. */}
          <Button onClick={onClose}>{t('admin.common.cancel')}</Button>
          {/* « Changer le mot de passe »: enabled once the three fields are consistent. */}
          <Button type="submit" variant="primary" disabled={!ready} busy={busy}>
            {t('admin.password.save')}
          </Button>
        </>
      }
    >
      <Field
        label={t('admin.password.current')}
        required
        error={failure?.field === 'current' ? failure.text : undefined}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            type="password"
            autoComplete="current-password"
            aria-describedby={describedBy}
            invalid={invalid}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('admin.password.new')}
        required
        help={t('admin.password.newHelp')}
        error={next.length > 0 && problem === 'same' ? t('admin.password.same') : undefined}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            invalid={invalid}
            maxLength={128}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('admin.password.confirm')}
        required
        error={
          confirmation.length > 0 && problem === 'mismatch'
            ? t('admin.password.mismatch')
            : undefined
        }
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            invalid={invalid}
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        )}
      </Field>
      {failure?.field === 'form' ? (
        <p className="dt-help error" role="alert">
          {failure.text}
        </p>
      ) : null}
    </Dialog>
  );
}
