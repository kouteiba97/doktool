'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleAlert, TimerOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { PdfPages } from '@/ui/pdf-pages';

/** A document of the case. */
type Document = Schemas['AdminVerificationDocumentDto'];

/** How many times the watermark text is repeated over the document. */
const WATERMARK_TILES = 12;

/**
 * RestrictedViewer: an identity document behind a 60-second signed URL, watermarked with the
 * viewer's name and time, without download, print, copy or drag. Each opening is audited by the
 * API; once the URL expires the document is hidden until it is opened again.
 */
export function RestrictedViewer({
  document,
  label,
  onClose,
}: {
  document: Document;
  label: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  // The signed URL whose 60 seconds are over (a new opening brings a new URL).
  const [expiredUrl, setExpiredUrl] = useState<string | null>(null);

  // Not cached: every opening asks the API again (a fresh audit entry and signed URL).
  const view = useQuery({
    queryKey: ['admin', 'verification', 'document', document.id],
    queryFn: () =>
      call(
        api.POST('/admin/v1/verification/documents/{id}/view', {
          params: { path: { id: document.id } },
        }),
      ),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!view.data) return;
    const { url, expiresAt } = view.data;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => setExpiredUrl(url), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [view.data]);
  const expired = view.data !== undefined && expiredUrl === view.data.url;

  // Printing and copying are refused while a document is on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['p', 's', 'c'].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const description = t('admin.verification.viewerAlt', {
    document: label,
    date: formatDateTime(locale, document.uploadedAt),
  });

  return (
    <section className="dt-stack" aria-label={label}>
      <div className="dt-row-flex justify-between">
        <b>{label}</b>
        <Button
          size="sm"
          variant="ghost"
          icon
          aria-label={t('admin.common.close')}
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </Button>
      </div>
      {view.isPending ? (
        <div className="dt-viewer p-4">
          <Skeleton lines={6} />
        </div>
      ) : view.isError ? (
        <EmptyState icon={CircleAlert} error title={t('admin.verification.viewerUnavailable')}>
          {errorText(view.error)}
        </EmptyState>
      ) : expired ? (
        <div className="dt-restricted">
          <TimerOff aria-hidden />
          <b>{t('admin.verification.viewerExpired')}</b>
          {/* « Rouvrir »: asks for a new 60-second link (a new audit entry). */}
          <Button size="sm" onClick={() => void view.refetch()}>
            {t('admin.verification.viewerReopen')}
          </Button>
        </div>
      ) : (
        <div
          className="dt-viewer"
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
          onCopy={(event) => event.preventDefault()}
        >
          {view.data.contentType === 'application/pdf' ? (
            <div className="p-3">
              <PdfPages url={view.data.url} label={description} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- signed private URL, never optimised or cached
            <img
              src={view.data.url}
              alt={description}
              draggable={false}
              referrerPolicy="no-referrer"
            />
          )}
          <div className="wmk" aria-hidden>
            {Array.from({ length: WATERMARK_TILES }, (_, index) => (
              <span key={index}>{view.data.watermark}</span>
            ))}
          </div>
          <span className="expiry">
            <Badge tone="warning">{t('admin.verification.viewerTimed')}</Badge>
          </span>
        </div>
      )}
    </section>
  );
}
