'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from '@/ui/button';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Switch, TextArea, TextInput } from '@/ui/field';
import { reasonSchema } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { type DocumentType, libraryKey, TYPE_LABELS } from './labels';
import { PdfDrop } from './pdf-drop';
import { putSigned, sha256Hex, suggestTitle, UploadFailed } from './upload';

const schema = z.object({
  titleFr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200),
  demoSample: z.boolean(),
  enable: z.boolean(),
  reason: reasonSchema,
});
type Values = z.infer<typeof schema>;

type Stage = 'idle' | 'hashing' | 'uploading' | 'saving';

/**
 * « Ajouter un modèle » (section 13): PDF → display title pre-filled from the file name (editable)
 * → optional English title → demo sample → status. Everything else is derived from the file.
 */
export function UploadDrawer({
  type,
  open,
  onClose,
  onCreated,
}: {
  type: DocumentType;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { titleFr: '', titleEn: '', demoSample: false, enable: true, reason: '' },
  });

  const onFile = (picked: File | null) => {
    setFile(picked);
    if (picked && !form.getValues('titleFr')) {
      form.setValue('titleFr', suggestTitle(picked.name), { shouldDirty: true });
    }
  };

  const submit = form.handleSubmit(async (values) => {
    if (!file) return;
    try {
      setStage('hashing');
      const sha256 = await sha256Hex(file);
      const start = await call(
        api.POST('/admin/v1/reference-documents/uploads', {
          body: { type, fileName: file.name, sizeBytes: file.size, sha256 },
        }),
      );
      setStage('uploading');
      await putSigned(start.upload, file);
      setStage('saving');
      const created = await call(
        api.POST('/admin/v1/reference-documents', {
          body: {
            documentId: start.documentId,
            intentId: start.upload.intentId,
            type,
            titleFr: values.titleFr.trim(),
            titleEn: values.titleEn.trim() || null,
            demoSample: values.demoSample,
            status: values.enable ? 'ENABLED' : 'DISABLED',
            reason: values.reason.trim(),
          },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: libraryKey(type) });
      toast(t('admin.library.created'));
      onCreated(created.id);
    } catch (error) {
      form.setError('root', {
        message: error instanceof UploadFailed ? t('admin.library.uploadFailed') : errorText(error),
      });
    } finally {
      setStage('idle');
    }
  });

  const { errors } = form.formState;
  const busy = stage !== 'idle';
  const dirty = file !== null || form.formState.isDirty;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      mode="edit"
      dirty={dirty && !busy}
      title={t('admin.library.newTitle')}
      caption={t(TYPE_LABELS[type])}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('admin.common.cancel')}
          </Button>
          <div className="end">
            <Button variant="primary" busy={busy} disabled={!file} onClick={() => void submit()}>
              {stage === 'hashing'
                ? t('admin.library.stageHashing')
                : stage === 'uploading'
                  ? t('admin.library.stageUploading')
                  : stage === 'saving'
                    ? t('admin.library.stageSaving')
                    : t('admin.library.create')}
            </Button>
          </div>
        </>
      }
    >
      <form className="dt-stack gap-4" noValidate onSubmit={(event) => void submit(event)}>
        <PdfDrop file={file} onFile={onFile} />
        <Field
          label={t('admin.library.titleFr')}
          required
          help={t('admin.library.titleHelp')}
          error={errors.titleFr ? t('admin.library.titleInvalid') : undefined}
        >
          {({ inputId, describedBy, invalid }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              maxLength={200}
              {...form.register('titleFr')}
            />
          )}
        </Field>
        <Field label={t('admin.library.titleEn')} help={t('admin.library.titleEnHelp')}>
          {({ inputId, describedBy }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              maxLength={200}
              {...form.register('titleEn')}
            />
          )}
        </Field>
        <Controller
          control={form.control}
          name="demoSample"
          render={({ field }) => (
            <div className="dt-stack gap-1">
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label={t('admin.library.demoSample')}
              />
              <p className="dt-help">{t('admin.library.demoSampleHelp')}</p>
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="enable"
          render={({ field }) => (
            <div className="dt-stack gap-1">
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label={t('admin.library.enableAfterProcessing')}
              />
              <p className="dt-help">{t('admin.library.enableAfterProcessingHelp')}</p>
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
