'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, call } from '@/api/client';
import { formatDate } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Select, TextInput } from '@/ui/field';
import { useToast } from '@/ui/toast';
import { ROLE_LABELS, type SourceRole, type Version } from './labels';

const ROLES: SourceRole[] = ['PRIMARY', 'VALIDATION', 'UNIT_CONVERSION'];

const schema = z.object({
  role: z.enum(['PRIMARY', 'VALIDATION', 'UNIT_CONVERSION']),
  authors: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(500),
  publisher: z.string().trim().min(1).max(300),
  year: z.coerce.number<string>().int().min(1800).max(2100),
  edition: z.string().trim().max(100),
  doi: z.string().trim().max(200),
  url: z.union([z.literal(''), z.url().max(500)]),
  formulaLocation: z.string().trim().min(1).max(300),
  accessedAt: z.iso.date(),
});
type Values = z.input<typeof schema>;

/** « Sources »: citation, edition, where the formula is stated, role (≥ 1 primary, section 28). */
export function SourcesPanel({
  version,
  onChanged,
}: {
  version: Version;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const { has } = useGrants();
  const [adding, setAdding] = useState(false);
  const editable = version.status === 'DRAFT' && has('calculators.draft');

  const remove = useMutation({
    mutationFn: (sourceId: string) =>
      call(
        api.DELETE('/admin/v1/calculators/versions/{versionId}/sources/{sourceId}', {
          params: { path: { versionId: version.id, sourceId } },
        }),
      ),
    onSuccess: async () => {
      await onChanged();
      toast(t('admin.calculators.sourceRemoved'));
    },
    onError: (error) => toast(errorText(error), 'error'),
  });

  return (
    <div className="dt-stack">
      {version.sources.length === 0 ? (
        <Alert tone="warning">{t('admin.calculators.noSources')}</Alert>
      ) : null}
      <ul className="dt-stack gap-2">
        {version.sources.map((source) => (
          <li key={source.id} className="dt-card gap-1 p-3">
            <div className="dt-row-flex">
              <Badge tone={source.role === 'PRIMARY' ? 'brand' : 'neutral'}>
                {t(ROLE_LABELS[source.role])}
              </Badge>
              <b className="min-w-0 flex-1">{source.title}</b>
              {editable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon
                  aria-label={t('admin.calculators.removeSource')}
                  busy={remove.isPending && remove.variables === source.id}
                  onClick={() => remove.mutate(source.id)}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              ) : null}
            </div>
            <div>
              {source.authors} · {source.publisher}, {source.year}
              {source.edition ? ` · ${source.edition}` : ''}
            </div>
            <div className="dt-cap">
              {t('admin.calculators.formulaLocation')}: {source.formulaLocation} ·{' '}
              {t('admin.calculators.accessedOn', { date: formatDate(locale, source.accessedAt) })}
            </div>
            {source.doi || source.url ? (
              <div className="dt-row-flex dt-cap">
                {source.doi ? <span className="dt-mono">doi:{source.doi}</span> : null}
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dt-row-flex text-brand"
                  >
                    {t('admin.calculators.openSource')}
                    <ExternalLink size={12} aria-hidden />
                  </a>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden />
            {t('admin.calculators.addSource')}
          </Button>
        </div>
      ) : null}
      <AddSourceDialog
        version={version}
        open={adding}
        onOpenChange={setAdding}
        onAdded={async () => {
          await onChanged();
          toast(t('admin.calculators.sourceAdded'));
        }}
      />
    </div>
  );
}

function AddSourceDialog({
  version,
  open,
  onOpenChange,
  onAdded,
}: {
  version: Version;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => Promise<void>;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const empty: Values = {
    role: version.sources.some((source) => source.role === 'PRIMARY') ? 'VALIDATION' : 'PRIMARY',
    authors: '',
    title: '',
    publisher: '',
    year: '',
    edition: '',
    doi: '',
    url: '',
    formulaLocation: '',
    accessedAt: new Date().toISOString().slice(0, 10),
  };
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  });
  useEffect(() => {
    if (open) form.reset(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open]);
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await call(
        api.POST('/admin/v1/calculators/versions/{versionId}/sources', {
          params: { path: { versionId: version.id } },
          body: {
            ...values,
            edition: values.edition || null,
            doi: values.doi || null,
            url: values.url || null,
          },
        }),
      );
      onOpenChange(false);
      await onAdded();
    } catch (error) {
      form.setError('root', { message: errorText(error) });
    }
  });

  const text = (
    name: Exclude<keyof Values, 'role'>,
    label: string,
    required: boolean,
    type = 'text',
  ) => (
    <Field
      label={label}
      required={required}
      error={errors[name] ? t('admin.common.fieldInvalid') : undefined}
    >
      {({ inputId, describedBy, invalid }) => (
        <TextInput
          id={inputId}
          type={type}
          aria-describedby={describedBy}
          invalid={invalid}
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
      title={t('admin.calculators.addSource')}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            {t('admin.calculators.addSource')}
          </Button>
        </>
      }
    >
      <Field label={t('admin.calculators.sourceRole')} required>
        {({ inputId }) => (
          <Select id={inputId} {...form.register('role')}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(ROLE_LABELS[role])}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {text('authors', t('admin.calculators.sourceAuthors'), true)}
      {text('title', t('admin.calculators.sourceTitle'), true)}
      <div className="grid grid-cols-2 gap-3">
        {text('publisher', t('admin.calculators.sourcePublisher'), true)}
        {text('year', t('admin.calculators.sourceYear'), true, 'number')}
        {text('edition', t('admin.calculators.sourceEdition'), false)}
        {text('accessedAt', t('admin.calculators.sourceAccessed'), true, 'date')}
        {text('doi', t('admin.calculators.sourceDoi'), false)}
        {text('url', t('admin.calculators.sourceUrl'), false, 'url')}
      </div>
      {text('formulaLocation', t('admin.calculators.formulaLocation'), true)}
      {errors.root?.message ? <Alert tone="critical">{errors.root.message}</Alert> : null}
    </Dialog>
  );
}
