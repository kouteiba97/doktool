'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Select, TextArea, TextInput } from '@/ui/field';
import {
  type ClinicalSource,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPES,
  type SourceType,
  type SubstanceDetail,
} from './labels';

/** Shape of an ATC code (A, A01, A01B, A01BC, A01BC01). */
const ATC = /^[A-Z]([0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?)?$/;

/** Rules of the substance form. */
const substanceSchema = z.object({
  nameFr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120),
  atcCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === '' || ATC.test(value)),
  synonyms: z.string().max(2400),
  reason: z.string().trim().min(3).max(500),
});
/** The substance form's values. */
type SubstanceForm = z.infer<typeof substanceSchema>;

/** « Nouvelle substance » or its names: DCI, English name, ATC code, synonyms. */
export function SubstanceDialog({
  substance,
  open,
  onOpenChange,
  onSaved,
}: {
  substance: SubstanceDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: SubstanceDetail) => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const form = useForm<z.input<typeof substanceSchema>, unknown, SubstanceForm>({
    resolver: zodResolver(substanceSchema),
    defaultValues: {
      nameFr: substance?.nameFr ?? '',
      nameEn: substance?.nameEn ?? '',
      atcCode: substance?.atcCode ?? '',
      synonyms: substance?.synonyms.join('\n') ?? '',
      reason: '',
    },
  });
  // Creates the substance, or saves its names, ATC code and synonyms.
  const save = useMutation({
    mutationFn: (values: SubstanceForm) => {
      const body = {
        nameFr: values.nameFr,
        nameEn: values.nameEn || null,
        atcCode: values.atcCode || null,
        synonyms: values.synonyms
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        reason: values.reason,
      };
      return substance
        ? call(
            api.PATCH('/admin/v1/pregnancy/substances/{id}', {
              params: { path: { id: substance.id } },
              body,
            }),
          )
        : call(api.POST('/admin/v1/pregnancy/substances', { body }));
    },
    onSuccess: (saved) => {
      onOpenChange(false);
      onSaved(saved);
    },
  });
  const { errors } = form.formState;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (save.isPending ? undefined : onOpenChange(next))}
      title={substance ? t('admin.pregnancy.editSubstance') : t('admin.pregnancy.addSubstance')}
      description={t('admin.pregnancy.substanceHelp')}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      footer={
        <>
          {/* « Annuler ». */}
          <Button onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('admin.common.cancel')}
          </Button>
          {/* « Enregistrer ». */}
          <Button type="submit" variant="primary" busy={save.isPending}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <Field
        label={t('admin.pregnancy.nameFr')}
        required
        error={errors.nameFr && t('admin.pregnancy.nameRequired')}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!errors.nameFr}
            {...form.register('nameFr')}
          />
        )}
      </Field>
      <Field label={t('admin.pregnancy.nameEn')}>
        {({ inputId }) => <TextInput id={inputId} {...form.register('nameEn')} />}
      </Field>
      <Field
        label={t('admin.pregnancy.atcCode')}
        help={t('admin.pregnancy.atcHelp')}
        error={errors.atcCode && t('admin.pregnancy.atcInvalid')}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            mono
            invalid={!!errors.atcCode}
            {...form.register('atcCode')}
          />
        )}
      </Field>
      <Field label={t('admin.pregnancy.synonyms')} help={t('admin.pregnancy.synonymsHelp')}>
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            rows={3}
            {...form.register('synonyms')}
          />
        )}
      </Field>
      <Field
        label={t('admin.common.reason')}
        required
        error={errors.reason && t('admin.common.reasonInvalid')}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            invalid={!!errors.reason}
            {...form.register('reason')}
          />
        )}
      </Field>
      {save.isError ? <Alert tone="critical">{errorText(save.error)}</Alert> : null}
    </Dialog>
  );
}

/** Rules of the source form. */
const sourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  publisher: z.string().trim().max(120),
  type: z.enum(SOURCE_TYPES as [SourceType, ...SourceType[]]),
  edition: z.string().trim().max(40),
  year: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' || (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 2100),
    ),
  url: z
    .string()
    .trim()
    .refine((value) => value === '' || /^https?:\/\/\S+$/.test(value)),
});
/** The source form's values. */
type SourceForm = z.infer<typeof sourceSchema>;

/** A source of the registry: CRAT, LactMed, RCP ANSM, Briggs… (section 25 Appendix B). */
export function SourceDialog({
  source,
  open,
  onOpenChange,
  onSaved,
}: {
  source: ClinicalSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: ClinicalSource) => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const form = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      title: source?.title ?? '',
      publisher: source?.publisher ?? '',
      type: source?.type ?? 'REFERENCE',
      edition: source?.edition ?? '',
      year: source?.year ? String(source.year) : '',
      url: source?.url ?? '',
    },
  });
  // Adds the source to the registry, or saves its changes.
  const save = useMutation({
    mutationFn: (values: SourceForm) => {
      const body = {
        title: values.title,
        publisher: values.publisher || null,
        type: values.type,
        edition: values.edition || null,
        year: values.year ? Number(values.year) : null,
        url: values.url || null,
      };
      return source
        ? call(
            api.PUT('/admin/v1/pregnancy/sources/{id}', {
              params: { path: { id: source.id } },
              body,
            }),
          )
        : call(api.POST('/admin/v1/pregnancy/sources', { body }));
    },
    onSuccess: (saved) => {
      onOpenChange(false);
      onSaved(saved);
    },
  });
  const { errors } = form.formState;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (save.isPending ? undefined : onOpenChange(next))}
      title={source ? t('admin.pregnancy.editSource') : t('admin.pregnancy.addSource')}
      description={t('admin.pregnancy.sourceHelp')}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      footer={
        <>
          {/* « Annuler ». */}
          <Button onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('admin.common.cancel')}
          </Button>
          {/* « Enregistrer la source ». */}
          <Button type="submit" variant="primary" busy={save.isPending}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <Field
        label={t('admin.pregnancy.sourceTitle')}
        required
        error={errors.title && t('admin.pregnancy.nameRequired')}
      >
        {({ inputId }) => (
          <TextInput id={inputId} invalid={!!errors.title} {...form.register('title')} />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.pregnancy.sourceType')} required>
          {({ inputId }) => (
            <Select id={inputId} {...form.register('type')}>
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(SOURCE_TYPE_LABELS[type])}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.pregnancy.sourcePublisher')}>
          {({ inputId }) => <TextInput id={inputId} {...form.register('publisher')} />}
        </Field>
        <Field
          label={t('admin.pregnancy.sourceEdition')}
          help={t('admin.pregnancy.sourceEditionHelp')}
        >
          {({ inputId, describedBy }) => (
            <TextInput id={inputId} aria-describedby={describedBy} {...form.register('edition')} />
          )}
        </Field>
        <Field
          label={t('admin.pregnancy.sourceYear')}
          error={errors.year && t('admin.pregnancy.yearInvalid')}
        >
          {({ inputId }) => (
            <TextInput
              id={inputId}
              inputMode="numeric"
              invalid={!!errors.year}
              {...form.register('year')}
            />
          )}
        </Field>
      </div>
      <Field
        label={t('admin.pregnancy.sourceUrl')}
        error={errors.url && t('admin.pregnancy.urlInvalid')}
      >
        {({ inputId }) => (
          <TextInput id={inputId} type="url" invalid={!!errors.url} {...form.register('url')} />
        )}
      </Field>
      {save.isError ? <Alert tone="critical">{errorText(save.error)}</Alert> : null}
    </Dialog>
  );
}
