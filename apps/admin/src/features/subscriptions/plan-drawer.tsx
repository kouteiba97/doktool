'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from '@/ui/button';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Switch, TextArea, TextInput } from '@/ui/field';
import {
  type Plan,
  PLAN_LIMITS,
  type PlanFormInput,
  type PlanFormOutput,
  planFormValues,
  planSchema,
  toPublishBody,
} from './plan-form';

/**
 * Publishes a plan version (ScreenSubscriptionsAdmin « Offres »). Editing never changes a sold
 * version: it publishes the next one; running subscriptions keep theirs.
 */
export function PlanDrawer({
  base,
  open,
  onClose,
  onPublished,
}: {
  /** The version to start from; null for a new plan code. */
  base: Plan | null;
  open: boolean;
  onClose: () => void;
  onPublished: (plan: Plan) => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const form = useForm<PlanFormInput, unknown, PlanFormOutput>({
    resolver: zodResolver(planSchema),
    defaultValues: planFormValues(base),
  });
  useEffect(() => {
    if (open) form.reset(planFormValues(base));
  }, [open, base, form]);
  const { errors, isSubmitting, isDirty } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      onPublished(await call(api.POST('/admin/v1/plans', { body: toPublishBody(values) })));
    } catch (error) {
      form.setError('root', { message: errorText(error) });
    }
  });

  const text = (
    name: 'nameFr' | 'nameEn' | 'price' | 'durationDays',
    label: string,
    extra?: { unit?: string; help?: string },
  ) => (
    <Field
      label={label}
      required
      help={extra?.help}
      error={errors[name] ? t('admin.common.fieldInvalid') : undefined}
    >
      {({ inputId, describedBy, invalid }) => (
        <TextInput
          id={inputId}
          aria-describedby={describedBy}
          invalid={invalid}
          inputMode={name === 'price' || name === 'durationDays' ? 'decimal' : undefined}
          unit={extra?.unit}
          {...form.register(name)}
        />
      )}
    </Field>
  );
  const list = (name: 'includesFr' | 'includesEn' | 'excludesFr' | 'excludesEn', label: string) => (
    <Field
      label={label}
      help={t('admin.plans.linesHelp', {
        max: PLAN_LIMITS.maxLines,
        length: PLAN_LIMITS.maxLineLength,
      })}
      error={errors[name] ? t('admin.plans.linesInvalid') : undefined}
    >
      {({ inputId, describedBy, invalid }) => (
        <TextArea
          id={inputId}
          aria-describedby={describedBy}
          invalid={invalid}
          rows={4}
          {...form.register(name)}
        />
      )}
    </Field>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      mode="edit"
      dirty={isDirty}
      title={
        base ? t('admin.plans.newVersionTitle', { code: base.code }) : t('admin.plans.newPlanTitle')
      }
      caption={base ? t('admin.plans.newVersionCaption', { version: base.version + 1 }) : null}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            {t('admin.common.cancel')}
          </Button>
          <div className="end">
            <Button variant="primary" busy={isSubmitting} onClick={() => void submit()}>
              {t('admin.plans.publish')}
            </Button>
          </div>
        </>
      }
    >
      <form className="dt-stack gap-4" noValidate onSubmit={(event) => void submit(event)}>
        <Alert tone="info">{t('admin.plans.versionNotice')}</Alert>
        <Field
          label={t('admin.plans.code')}
          required
          help={t('admin.plans.codeHelp')}
          error={errors.code ? t('admin.plans.codeInvalid') : undefined}
        >
          {({ inputId, describedBy, invalid }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              mono
              readOnly={base !== null}
              {...form.register('code')}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {text('nameFr', t('admin.plans.nameFr'))}
          {text('nameEn', t('admin.plans.nameEn'))}
          {text('price', t('admin.plans.price'), { unit: 'DZD', help: t('admin.plans.priceHelp') })}
          {text('durationDays', t('admin.plans.duration'), { unit: t('admin.plans.days') })}
        </div>
        <fieldset className="dt-stack gap-2">
          <legend className="dt-label">{t('admin.plans.audience')}</legend>
          <Controller
            control={form.control}
            name="doctor"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label={t('admin.common.typeDoctor')}
              />
            )}
          />
          <Controller
            control={form.control}
            name="resident"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label={t('admin.common.typeResident')}
              />
            )}
          />
          {errors.doctor ? (
            <p className="dt-help error">{t('admin.plans.audienceRequired')}</p>
          ) : null}
          <p className="dt-help">{t('admin.plans.audienceHelp')}</p>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          {list('includesFr', t('admin.plans.includesFr'))}
          {list('includesEn', t('admin.plans.includesEn'))}
          {list('excludesFr', t('admin.plans.excludesFr'))}
          {list('excludesEn', t('admin.plans.excludesEn'))}
        </div>
        <Controller
          control={form.control}
          name="isPurchasable"
          render={({ field }) => (
            <div className="dt-stack gap-1">
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label={t('admin.plans.purchasable')}
              />
              <p className="dt-help">{t('admin.plans.purchasableHelp')}</p>
            </div>
          )}
        />
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
              rows={2}
              maxLength={500}
              {...form.register('reason')}
            />
          )}
        </Field>
        {errors.root?.message ? <Alert tone="critical">{errors.root.message}</Alert> : null}
      </form>
    </Drawer>
  );
}
