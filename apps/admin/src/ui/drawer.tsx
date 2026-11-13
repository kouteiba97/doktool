'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from './button';

/** What a drawer shows and how it behaves. */
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  caption?: ReactNode;
  status?: ReactNode;
  /** `inspect` keeps the list usable (non-modal); `edit` and `review` are modal. */
  mode: 'inspect' | 'edit' | 'review';
  /** Unsaved changes: closing asks for confirmation first. */
  dirty?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/** Right-hand drawer (480 px, 560 px from 1440 px) opened from a table row (component Drawer). */
export function Drawer({
  open,
  onClose,
  title,
  caption,
  status,
  mode,
  dirty,
  footer,
  children,
}: DrawerProps) {
  const { t } = useI18n();
  // Closing a drawer with unsaved changes asks for confirmation first.
  const close = () => {
    if (dirty && !window.confirm(t('admin.common.discardChanges'))) return;
    onClose();
  };
  const modal = mode !== 'inspect';
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      modal={modal}
    >
      <RadixDialog.Portal>
        {modal ? <RadixDialog.Overlay className="dt-scrim drawer" /> : null}
        <RadixDialog.Content
          className="dt-drawer"
          onInteractOutside={(event) => {
            if (!modal) event.preventDefault();
          }}
          aria-describedby={undefined}
        >
          <div className="hd">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="dt-heading">{title}</RadixDialog.Title>
              {caption ? <div className="dt-cap">{caption}</div> : null}
            </div>
            {status}
            <Button
              variant="ghost"
              size="sm"
              icon
              aria-label={t('admin.common.close')}
              onClick={close}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
          <div className="bd">{children}</div>
          {footer ? <div className="ft">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
