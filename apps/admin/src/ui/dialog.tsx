'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer: ReactNode;
  wide?: boolean;
  children?: ReactNode;
  /** Wraps body and footer (a form submits from its footer button). */
  onSubmit?: () => void;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  wide,
  children,
  onSubmit,
}: DialogProps) {
  const body = (
    <>
      <div className="bd">
        {description ? <RadixDialog.Description>{description}</RadixDialog.Description> : null}
        {children}
      </div>
      <div className="ft">{footer}</div>
    </>
  );
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dt-scrim" />
        <RadixDialog.Content
          className={`dt-dialog${wide ? ' wide' : ''}`}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="hd">
            <RadixDialog.Title className="dt-heading">{title}</RadixDialog.Title>
          </div>
          {onSubmit ? (
            <form
              className="flex min-h-0 flex-col"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              {body}
            </form>
          ) : (
            body
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
