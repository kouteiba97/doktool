'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiFailure, api, call, type Schemas } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { meQueryKey, safeNext } from '@/session/session';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, TextInput } from '@/ui/field';

type Step = Schemas['AdminSignInStepDto'];

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Admin sign-in: e-mail + password, then the mandatory TOTP code (ADR-009). */
export function SignInForm() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step | null>(null);
  return (
    <div className="dt-card w-full max-w-dialog gap-5 p-8 shadow-md">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
        <img src="/logo.svg" alt="DokTool" className="h-8 w-auto" />
        <h1 className="dt-title">{t('admin.signIn.title')}</h1>
        <p className="dt-cap text-center">{t('admin.signIn.subtitle')}</p>
      </div>
      {step ? (
        <TotpStep step={step} onRestart={() => setStep(null)} />
      ) : (
        <CredentialsStep onNext={setStep} />
      )}
    </div>
  );
}

function CredentialsStep({ onNext }: { onNext: (step: Step) => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const form = useForm({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      onNext(await call(api.POST('/admin/v1/auth/sign-in', { body: values })));
    } catch (error) {
      form.setError('root', { message: errorText(error) });
    }
  });
  return (
    <form className="dt-stack gap-4" noValidate onSubmit={(event) => void submit(event)}>
      <Field
        label={t('admin.signIn.email')}
        required
        error={errors.email ? t('admin.signIn.emailInvalid') : undefined}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            type="email"
            autoComplete="username"
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register('email')}
          />
        )}
      </Field>
      <Field
        label={t('admin.signIn.password')}
        required
        error={errors.password ? t('admin.signIn.passwordRequired') : undefined}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            type="password"
            autoComplete="current-password"
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register('password')}
          />
        )}
      </Field>
      {errors.root?.message ? <Alert tone="critical">{errors.root.message}</Alert> : null}
      <Button type="submit" variant="primary" busy={isSubmitting}>
        {t('admin.signIn.continue')}
      </Button>
    </form>
  );
}

function TotpStep({ step, onRestart }: { step: Step; onRestart: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const queryClient = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const enrollment = step.next === 'TOTP_ENROLL' ? step.enrollment : null;

  useEffect(() => {
    if (!enrollment) return;
    let cancelled = false;
    void QRCode.toDataURL(enrollment.otpauthUri, { margin: 1, width: 192 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [enrollment]);

  const form = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async ({ code }) => {
    try {
      const me = await call(
        api.POST('/admin/v1/auth/totp', { body: { challengeToken: step.challengeToken, code } }),
      );
      queryClient.setQueryData(meQueryKey, me);
      router.replace(next);
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'CHALLENGE_INVALID') {
        onRestart();
        return;
      }
      form.setError('root', { message: errorText(error) });
      form.setValue('code', '');
    }
  });

  return (
    <form className="dt-stack gap-4" noValidate onSubmit={(event) => void submit(event)}>
      {enrollment ? (
        <div className="dt-stack items-center text-center">
          <p>{t('admin.signIn.enrollIntro')}</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img src={qr} alt={t('admin.signIn.enrollQrAlt')} className="dt-qr" />
          ) : (
            <div className="dt-skeleton dt-qr" aria-hidden />
          )}
          <p className="dt-cap">{t('admin.signIn.enrollManual')}</p>
          <code className="dt-mono select-all break-all">{enrollment.secretBase32}</code>
        </div>
      ) : (
        <p>{t('admin.signIn.totpIntro')}</p>
      )}
      <Field
        label={t('admin.signIn.code')}
        required
        error={errors.code ? t('admin.signIn.codeInvalid') : undefined}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            mono
            autoFocus
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register('code')}
          />
        )}
      </Field>
      {errors.root?.message ? <Alert tone="critical">{errors.root.message}</Alert> : null}
      <Button type="submit" variant="primary" busy={isSubmitting}>
        {enrollment ? t('admin.signIn.enrollConfirm') : t('admin.signIn.verify')}
      </Button>
      <Button variant="ghost" onClick={onRestart} disabled={isSubmitting}>
        {t('admin.signIn.restart')}
      </Button>
    </form>
  );
}
