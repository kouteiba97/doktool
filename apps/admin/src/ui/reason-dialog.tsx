'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useI18n } from '@/i18n/i18n-provider';
import { Button, type ButtonVariant } from './button';
import { Dialog } from './dialog';
import { useErrorText } from './errors';
import { Alert } from './feedback';
import { Field, TextArea } from './field';

/** Same bounds as the API's reason fields (3–500 characters, trimmed). */
export const reasonSchema = z.string().trim().min(3).max(500);

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  confirmVariant?: ButtonVariant;
  /** Extra controls above the reason (e.g. the rejection reason picker). */
  children?: ReactNode;
  /** Disables confirmation while the extra controls are incomplete. */
  ready?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
}

/**
 * Every decision that affects a user, money or content asks for a reason; the API writes it to
 * the audit log with the decision (section 07).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = 'primary',
  children,
  ready = true,
  onConfirm,
}: ReasonDialogProps) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const form = useForm<{ reason: string }>({
    resolver: zodResolver(z.object({ reason: reasonSchema })),
    defaultValues: { reason: '' },
  });
  useEffect(() => {
    if (open) form.reset({ reason: '' });
  }, [open, form]);

  const submit = form.handleSubmit(async ({ reason }) => {
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (error) {
      form.setError('root', { message: errorText(error) });
    }
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}
      title={title}
      description={description}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="submit" variant={confirmVariant} busy={isSubmitting} disabled={!ready}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      <Field
        label={t('admin.common.reason')}
        required
        help={t('admin.common.reasonHelp')}
        error={errors.reason ? t('admin.common.reasonInvalid') : undefined}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            invalid={invalid}
            maxLength={500}
            rows={3}
            {...form.register('reason')}
          />
        )}
      </Field>
      {errors.root?.message ? <Alert tone="critical">{errors.root.message}</Alert> : null}
    </Dialog>
  );
}
