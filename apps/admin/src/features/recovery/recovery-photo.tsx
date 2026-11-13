'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleAlert, TimerOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { RECOVERY_SLOT_LABELS, type RecoveryPhotoSlot } from './labels';

/** How many times the watermark text is repeated over the photo. */
const WATERMARK_TILES = 12;

/**
 * A recovery photo behind a 60-second signed URL, watermarked with the viewer's name and time,
 * without download, copy or drag (same rules as the verification viewer). Each opening is
 * audited by the API.
 */
export function RecoveryPhoto({
  requestId,
  slot,
  onClose,
}: {
  requestId: string;
  slot: RecoveryPhotoSlot;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [expiredUrl, setExpiredUrl] = useState<string | null>(null);
  const label = t(RECOVERY_SLOT_LABELS[slot]);

  const view = useQuery({
    queryKey: ['admin', 'account-recoveries', requestId, 'photo', slot],
    queryFn: () =>
      call(
        api.POST('/admin/v1/account-recoveries/{id}/photos/{slot}', {
          params: { path: { id: requestId, slot } },
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['p', 's', 'c'].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

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
          {/* « Rouvrir »: a new 60-second link (a new audit entry). */}
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
          {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL, never optimised or cached */}
          <img src={view.data.url} alt={label} draggable={false} referrerPolicy="no-referrer" />
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
