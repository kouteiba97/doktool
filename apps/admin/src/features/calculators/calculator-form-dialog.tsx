'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Select, Switch, TextArea, TextInput } from '@/ui/field';
import { reasonSchema } from '@/ui/reason-dialog';
import {
  ACCESS_LABELS,
  type AccessTier,
  type Calculator,
  CATEGORY_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PURPOSE_MAX_LENGTH,
  SLUG_PATTERN,
} from './labels';

/** Rules of the calculator form (same limits as the API). */
const schema = z.object({
  slug: z.string().trim().max(80).regex(SLUG_PATTERN),
  nameFr: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  nameEn: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  purposeFr: z.string().trim().max(PURPOSE_MAX_LENGTH),
  purposeEn: z.string().trim().max(PURPOSE_MAX_LENGTH),
  category: z.string().trim().max(CATEGORY_MAX_LENGTH),
  accessTier: z.enum(['STUDENT', 'PROFESSIONAL']),
  demoSample: z.boolean(),
  reason: reasonSchema,
});
type Values = z.infer<typeof schema>;

/** Access tiers a calculator can have. */
const TIERS: AccessTier[] = ['STUDENT', 'PROFESSIONAL'];

/** The form's starting values: the calculator's, or empty for a new one. */
const valuesOf = (calculator: Calculator | null): Values => ({
  slug: calculator?.slug ?? '',
  nameFr: calculator?.nameFr ?? '',
  nameEn: calculator?.nameEn ?? '',
  purposeFr: calculator?.purposeFr ?? '',
  purposeEn: calculator?.purposeEn ?? '',
  category: calculator?.category ?? '',
  accessTier: calculator?.accessTier ?? 'STUDENT',
  demoSample: calculator?.demoSample ?? false,
  reason: '',
});

/** An empty text becomes null (cleared). */
const orNull = (value: string) => value.trim() || null;

/** New calculator, or its catalogue fields (names, purpose, category, access, demo sample). */
export function CalculatorFormDialog({
  calculator,
  open,
  onOpenChange,
  onSaved,
}: {
  /** Null creates a new calculator. */
  calculator: Calculator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: Calculator) => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { has } = useGrants();
  // Access tier and demo sample change who can open it: the reviewer's grant (API rule).
  const canSetAccess = calculator === null || has('calculators.publish');
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(calculator),
  });
  useEffect(() => {
    if (open) form.reset(valuesOf(calculator));
  }, [open, calculator, form]);
  const { errors, isSubmitting } = form.formState;

  // Sends the form: PATCH for an edit (access only with the publish grant), POST for a new
  // calculator.
  const submit = form.handleSubmit(async (values) => {
    try {
      const common = {
        nameFr: values.nameFr.trim(),
        nameEn: values.nameEn.trim(),
        purposeFr: orNull(values.purposeFr),
        purposeEn: orNull(values.purposeEn),
        category: orNull(values.category),
        reason: values.reason.trim(),
      };
      const saved = calculator
        ? await call(
            api.PATCH('/admin/v1/calculators/{id}', {
              params: { path: { id: calculator.id } },
              body: canSetAccess
                ? { ...common, accessTier: values.accessTier, demoSample: values.demoSample }
                : common,
            }),
          )
        : await call(
            api.POST('/admin/v1/calculators', {
              body: {
                ...common,
                slug: values.slug.trim(),
                accessTier: values.accessTier,
                demoSample: values.demoSample,
              },
            }),
          );
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      form.setError('root', { message: errorText(error) });
    }
  });

  const text = (
    name: 'nameFr' | 'nameEn' | 'purposeFr' | 'purposeEn' | 'category',
    label: string,
    max: number,
    required: boolean,
  ) => (
    <Field
      label={label}
      required={required}
      error={errors[name] ? t('admin.common.fieldInvalid') : undefined}
    >
      {({ inputId, describedBy, invalid }) => (
        <TextInput
          id={inputId}
          aria-describedby={describedBy}
          invalid={invalid}
          maxLength={max}
          {...form.register(name)}
        />
      )}
    </Field>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}
      wide
      title={calculator ? t('admin.calculators.editTitle') : t('admin.calculators.newTitle')}
      onSubmit={() => void submit()}
      footer={
        <>
          {/* « Annuler ». */}
          <Button onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('admin.common.cancel')}
          </Button>
          {/* « Enregistrer ». */}
          <Button type="submit" variant="primary" busy={isSubmitting}>
            {calculator ? t('admin.common.save') : t('admin.calculators.create')}
          </Button>
        </>
      }
    >
      <Field
        label={t('admin.calculators.slug')}
        required
        help={calculator ? t('admin.calculators.slugFixed') : t('admin.calculators.slugHelp')}
        error={errors.slug ? t('admin.calculators.slugInvalid') : undefined}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            invalid={invalid}
            mono
            readOnly={calculator !== null}
            maxLength={80}
            {...form.register('slug')}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {text('nameFr', t('admin.calculators.nameFr'), NAME_MAX_LENGTH, true)}
        {text('nameEn', t('admin.calculators.nameEn'), NAME_MAX_LENGTH, true)}
        {text('purposeFr', t('admin.calculators.purposeFr'), PURPOSE_MAX_LENGTH, false)}
        {text('purposeEn', t('admin.calculators.purposeEn'), PURPOSE_MAX_LENGTH, false)}
      </div>
      {text('category', t('admin.calculators.category'), CATEGORY_MAX_LENGTH, false)}
      <Field
        label={t('admin.calculators.access')}
        required
        help={canSetAccess ? undefined : t('admin.calculators.accessNeedsReviewer')}
      >
        {({ inputId, describedBy }) => (
          <Select
            id={inputId}
            aria-describedby={describedBy}
            disabled={!canSetAccess}
            {...form.register('accessTier')}
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {t(ACCESS_LABELS[tier])}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Controller
        control={form.control}
        name="demoSample"
        render={({ field }) => (
          <Switch
            checked={field.value}
            onChange={field.onChange}
            disabled={!canSetAccess}
            label={t('admin.calculators.demoSample')}
          />
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
    </Dialog>
  );
}
