'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Eye, EyeOff, FileUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, call } from '@/api/client';
import { formatBytes, formatDate, formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, Skeleton } from '@/ui/feedback';
import { Field, Switch, TextArea, TextInput } from '@/ui/field';
import { OverflowMenu } from '@/ui/menu';
import { PdfPages } from '@/ui/pdf-pages';
import { ReasonDialog, reasonSchema } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { SynonymsEditor } from '../search/synonyms-editor';
import {
  documentKey,
  FILE_STATUS_LABELS,
  FILE_STATUS_TONES,
  libraryKey,
  type ReferenceDocument,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
} from './labels';
import { PdfDrop } from './pdf-drop';
import { putSigned, sha256Hex, UploadFailed } from './upload';

/** Status changes offered by the drawer. */
type Lifecycle = 'enable' | 'disable' | 'archive' | 'restore';

/** Rules of the editable fields. */
const metadataSchema = z.object({
  titleFr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200),
  demoSample: z.boolean(),
});
type Metadata = z.infer<typeof metadataSchema>;

/** While a file is processing, the drawer follows its status. */
const PROCESSING_POLL_MS = 3_000;

/** Dialog texts of each status change. */
const LIFECYCLE_COPY: Record<
  Lifecycle,
  { title: MessageKey; body: MessageKey; confirm: MessageKey }
> = {
  enable: {
    title: 'admin.library.enableTitle',
    body: 'admin.library.enableBody',
    confirm: 'admin.library.enable',
  },
  disable: {
    title: 'admin.library.disableTitle',
    body: 'admin.library.disableBody',
    confirm: 'admin.library.disable',
  },
  archive: {
    title: 'admin.library.archiveTitle',
    body: 'admin.library.archiveBody',
    confirm: 'admin.library.archive',
  },
  restore: {
    title: 'admin.library.restoreTitle',
    body: 'admin.library.restoreBody',
    confirm: 'admin.library.restore',
  },
};

/** API path of each status change. */
const LIFECYCLE_PATHS = {
  enable: '/admin/v1/reference-documents/{id}/enable',
  disable: '/admin/v1/reference-documents/{id}/disable',
  archive: '/admin/v1/reference-documents/{id}/archive',
  restore: '/admin/v1/reference-documents/{id}/restore',
} as const;

/** Reference model drawer (ScreenReferenceLibraryAdmin): file, titles, demo sample, status. */
export function DocumentDrawer({
  documentId,
  onClose,
}: {
  documentId: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [saving, setSaving] = useState<Metadata | null>(null);
  const [replacing, setReplacing] = useState(false);
  // The file being previewed; another model or a new current file closes the preview.
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  // The model; refreshed every 3 seconds while a file is processing.
  const detail = useQuery({
    queryKey: documentKey(documentId ?? ''),
    queryFn: () =>
      call(
        api.GET('/admin/v1/reference-documents/{id}', {
          params: { path: { id: documentId ?? '' } },
        }),
      ),
    enabled: documentId !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      const processing =
        data?.status === 'PROCESSING' ||
        data?.files.some((file) => file.processingStatus === 'PENDING');
      return processing ? PROCESSING_POLL_MS : false;
    },
  });
  const record = detail.data;

  // The saved metadata; polling while a file processes never overwrites what the admin typed.
  const saved = useMemo<Metadata>(
    () => ({
      titleFr: record?.titleFr ?? '',
      titleEn: record?.titleEn ?? '',
      demoSample: record?.demoSample ?? false,
    }),
    [record?.titleFr, record?.titleEn, record?.demoSample],
  );
  // The edit form; a refresh never overwrites what the admin is typing.
  const form = useForm<Metadata>({
    resolver: zodResolver(metadataSchema),
    values: saved,
    resetOptions: { keepDirtyValues: true },
  });

  // Processing ends on the server: the list's status and counts follow.
  const documentType = record?.type;
  const documentStatus = record?.status;
  useEffect(() => {
    if (documentType && documentStatus) {
      void queryClient.invalidateQueries({ queryKey: libraryKey(documentType) });
    }
  }, [documentType, documentStatus, queryClient]);

  // After a change: update the drawer and the list, confirm with a toast.
  const updated = (next: ReferenceDocument, message: string) => {
    queryClient.setQueryData(documentKey(next.id), next);
    void queryClient.invalidateQueries({ queryKey: libraryKey(next.type) });
    toast(message);
  };

  const preview = previewFile !== null && previewFile === record?.currentFile?.id;
  const canWrite = has('library.write');
  const canDisable = has('library.disable');
  const archived = record?.status === 'ARCHIVED';
  const { errors, isDirty } = form.formState;

  const footer = record ? (
    <>
      <OverflowMenu
        label={t('admin.common.moreActions')}
        actions={[
          {
            label: t('admin.library.enable'),
            onSelect: () => setLifecycle('enable'),
            hidden: !canDisable || record.status !== 'DISABLED',
            disabled: !record.currentFile,
          },
          {
            label: t('admin.library.disable'),
            onSelect: () => setLifecycle('disable'),
            hidden: !canDisable || record.status !== 'ENABLED',
          },
          {
            label: t('admin.library.archive'),
            onSelect: () => setLifecycle('archive'),
            hidden: !canWrite || (record.status !== 'ENABLED' && record.status !== 'DISABLED'),
            danger: true,
          },
          {
            label: t('admin.library.restore'),
            onSelect: () => setLifecycle('restore'),
            hidden: !canWrite || !archived,
          },
        ]}
      />
      {canWrite && !archived ? (
        <div className="end">
          {/* « Enregistrer »: asks for a reason, then saves titles and demo sample. */}
          <Button
            variant="primary"
            disabled={!isDirty}
            onClick={() => void form.handleSubmit((values) => setSaving(values))()}
          >
            {t('admin.common.save')}
          </Button>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <Drawer
      open={documentId !== null}
      onClose={onClose}
      mode="edit"
      dirty={isDirty}
      title={record ? record.titleFr : t('admin.library.model')}
      caption={record ? t(TYPE_LABELS[record.type]) : null}
      status={
        record ? (
          <Badge tone={STATUS_TONES[record.status]}>{t(STATUS_LABELS[record.status])}</Badge>
        ) : null
      }
      footer={footer}
    >
      {detail.isPending ? (
        <Skeleton lines={8} />
      ) : detail.isError || !record ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(detail.error)}
        </EmptyState>
      ) : (
        <>
          <section className="dt-card" aria-labelledby="file-heading">
            <div className="dt-row-flex justify-between">
              <h3 id="file-heading" className="dt-heading">
                {t('admin.library.file')}
              </h3>
              <div className="flex gap-2">
                {record.currentFile ? (
                  // « Voir le PDF » / « Masquer »: shows the current PDF in the drawer (no download
                  // or print).
                  <Button
                    size="sm"
                    onClick={() =>
                      setPreviewFile(preview ? null : (record.currentFile?.id ?? null))
                    }
                  >
                    {preview ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                    {preview ? t('admin.library.hidePdf') : t('admin.library.viewPdf')}
                  </Button>
                ) : null}
                {canWrite && !archived ? (
                  // « Remplacer le PDF »: uploads a new version under the same model.
                  <Button size="sm" onClick={() => setReplacing(true)}>
                    <FileUp size={14} aria-hidden />
                    {t('admin.library.replacePdf')}
                  </Button>
                ) : null}
              </div>
            </div>
            {record.currentFile ? (
              <dl className="dt-dl">
                <dt>{t('admin.library.fileVersion')}</dt>
                <dd>v{record.currentFile.version}</dd>
                <dt>{t('admin.library.pages')}</dt>
                <dd>{record.currentFile.pageCount ?? '—'}</dd>
                <dt>{t('admin.library.size')}</dt>
                <dd>{formatBytes(locale, record.currentFile.sizeBytes)}</dd>
                <dt>{t('admin.library.checksum')}</dt>
                <dd className="dt-mono break-all whitespace-normal">
                  {record.currentFile.sha256 ?? '—'}
                </dd>
              </dl>
            ) : (
              <p className="dt-cap">{t('admin.library.noProcessedFile')}</p>
            )}
            {record.files
              .filter(
                (file) => file.id !== record.currentFile?.id && file.processingStatus !== 'READY',
              )
              .map((file) => (
                <Alert
                  key={file.id}
                  tone={file.processingStatus === 'FAILED' ? 'critical' : 'info'}
                  title={t(
                    file.processingStatus === 'FAILED'
                      ? 'admin.library.fileFailedTitle'
                      : 'admin.library.fileProcessingTitle',
                    { version: file.version },
                  )}
                >
                  {file.processingStatus === 'FAILED' ? t('admin.library.fileFailedBody') : null}
                </Alert>
              ))}
            {preview && record.currentFile ? (
              <DocumentPreview
                documentId={record.id}
                fileId={record.currentFile.id}
                title={record.titleFr}
              />
            ) : null}
          </section>

          <form className="dt-stack gap-4" noValidate onSubmit={(event) => event.preventDefault()}>
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
                  readOnly={!canWrite || archived}
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
                  readOnly={!canWrite || archived}
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
                    disabled={!canWrite || archived}
                    label={t('admin.library.demoSample')}
                  />
                  <p className="dt-help">{t('admin.library.demoSampleHelp')}</p>
                </div>
              )}
            />
          </form>

          <section className="dt-stack" aria-labelledby="synonyms-heading">
            <h3 id="synonyms-heading" className="dt-heading">
              {t('admin.synonyms.title')}
            </h3>
            <SynonymsEditor entityType="REFERENCE_DOCUMENT" entityId={record.id} />
          </section>

          <section className="dt-stack" aria-labelledby="versions-heading">
            <h3 id="versions-heading" className="dt-heading">
              {t('admin.library.versions')}
            </h3>
            <ul className="dt-stack gap-2">
              {record.files.map((file) => (
                <li key={file.id} className="dt-row-flex">
                  <b>v{file.version}</b>
                  <Badge tone={FILE_STATUS_TONES[file.processingStatus]}>
                    {t(FILE_STATUS_LABELS[file.processingStatus])}
                  </Badge>
                  {file.id === record.currentFile?.id ? (
                    <Badge tone="brand">{t('admin.library.current')}</Badge>
                  ) : null}
                  <span className="dt-cap">
                    {formatDateTime(locale, file.uploadedAt)} ·{' '}
                    {formatBytes(locale, file.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="dt-cap">
              {t('admin.library.createdBy', {
                name: record.createdBy.fullName,
                date: formatDate(locale, record.createdAt),
              })}
              {' · '}
              {t('admin.library.updatedBy', {
                name: record.updatedBy.fullName,
                date: formatDate(locale, record.updatedAt),
              })}
            </p>
          </section>

          <ReasonDialog
            open={saving !== null}
            onOpenChange={(open) => (open ? undefined : setSaving(null))}
            title={t('admin.library.saveTitle')}
            description={t('admin.library.saveBody')}
            confirmLabel={t('admin.common.save')}
            onConfirm={async (reason) => {
              if (!saving) return;
              const next = await call(
                api.PATCH('/admin/v1/reference-documents/{id}', {
                  params: { path: { id: record.id } },
                  body: {
                    reason,
                    titleFr: saving.titleFr.trim(),
                    titleEn: saving.titleEn.trim() || null,
                    demoSample: saving.demoSample,
                  },
                }),
              );
              updated(next, t('admin.library.saved'));
            }}
          />
          <ReasonDialog
            open={lifecycle !== null}
            onOpenChange={(open) => (open ? undefined : setLifecycle(null))}
            title={lifecycle ? t(LIFECYCLE_COPY[lifecycle].title) : ''}
            description={lifecycle ? t(LIFECYCLE_COPY[lifecycle].body) : undefined}
            confirmLabel={lifecycle ? t(LIFECYCLE_COPY[lifecycle].confirm) : ''}
            confirmVariant={
              lifecycle === 'archive' || lifecycle === 'disable' ? 'danger' : 'primary'
            }
            onConfirm={async (reason) => {
              if (!lifecycle) return;
              const next = await call(
                api.POST(LIFECYCLE_PATHS[lifecycle], {
                  params: { path: { id: record.id } },
                  body: { reason },
                }),
              );
              updated(next, t('admin.library.statusChanged'));
            }}
          />
          {replacing ? (
            <ReplaceDialog
              record={record}
              open
              onOpenChange={setReplacing}
              onDone={(next) => updated(next, t('admin.library.replaced'))}
            />
          ) : null}
        </>
      )}
    </Drawer>
  );
}

/** The PDF of one file version, drawn on canvases from a signed URL. */
function DocumentPreview({
  documentId,
  fileId,
  title,
}: {
  documentId: string;
  fileId: string;
  title: string;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [failed, setFailed] = useState(false);
  const signed = useQuery({
    queryKey: ['admin', 'library', 'preview', fileId],
    queryFn: () =>
      call(
        api.GET('/admin/v1/reference-documents/{id}/files/{fileId}/url', {
          params: { path: { id: documentId, fileId } },
        }),
      ),
    // Signed for 10 minutes; asked again after 9.
    staleTime: 9 * 60_000,
  });
  if (signed.isPending) return <Skeleton lines={4} />;
  if (signed.isError) return <p className="dt-help error">{errorText(signed.error)}</p>;
  return (
    <div className="dt-pdf" onContextMenu={(event) => event.preventDefault()}>
      {failed ? <p className="dt-help error">{t('admin.library.previewFailed')}</p> : null}
      <PdfPages
        url={signed.data.url}
        label={t('admin.library.previewAlt', { title })}
        onOutcome={(outcome) => setFailed(outcome === 'error')}
      />
    </div>
  );
}

/** « Remplacer le PDF »: a new file version; favourites and links keep working. */
function ReplaceDialog({
  record,
  open,
  onOpenChange,
  onDone,
}: {
  record: ReferenceDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (next: ReferenceDocument) => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Checksum → signed upload → PUT → register the new version (processed in the background).
  const replace = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const sha256 = await sha256Hex(file);
      const start = await call(
        api.POST('/admin/v1/reference-documents/{id}/replacement-uploads', {
          params: { path: { id: record.id } },
          body: { fileName: file.name, sizeBytes: file.size, sha256 },
        }),
      );
      await putSigned(start.upload, file);
      const next = await call(
        api.POST('/admin/v1/reference-documents/{id}/files', {
          params: { path: { id: record.id } },
          body: { intentId: start.upload.intentId, version: start.version, reason: reason.trim() },
        }),
      );
      onDone(next);
      onOpenChange(false);
    },
    onError: (failure) =>
      setError(
        failure instanceof UploadFailed ? t('admin.library.uploadFailed') : errorText(failure),
      ),
  });
  const reasonValid = reasonSchema.safeParse(reason).success;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (replace.isPending ? undefined : onOpenChange(next))}
      title={t('admin.library.replaceTitle')}
      description={t('admin.library.replaceBody')}
      onSubmit={() => replace.mutate()}
      footer={
        <>
          {/* « Annuler ». */}
          <Button onClick={() => onOpenChange(false)} disabled={replace.isPending}>
            {t('admin.common.cancel')}
          </Button>
          {/* « Remplacer le PDF »: possible once a PDF and a reason are given. */}
          <Button
            type="submit"
            variant="primary"
            busy={replace.isPending}
            disabled={!file || !reasonValid}
          >
            {t('admin.library.replacePdf')}
          </Button>
        </>
      }
    >
      <PdfDrop file={file} onFile={setFile} />
      <Field label={t('admin.common.reason')} required help={t('admin.common.reasonHelp')}>
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </Field>
      {error ? <Alert tone="critical">{error}</Alert> : null}
    </Dialog>
  );
}
