import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Kinds of alert. */
type AlertTone = 'critical' | 'warning' | 'info' | 'success' | 'neutral';

const ICONS = {
  critical: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  success: CircleCheck,
  neutral: Info,
} as const;

/** A coloured message box with an icon; critical ones are announced to screen readers. */
export function Alert({
  tone,
  title,
  children,
  action,
}: {
  tone: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div className={`dt-alert ${tone}`} role={tone === 'critical' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <div className="t">{title}</div> : null}
        {children ? <div className="b">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

/** What a page shows when it has nothing (or failed to load). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  error,
  action,
}: {
  icon: typeof Info;
  title: ReactNode;
  children?: ReactNode;
  error?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`dt-empty${error ? ' error' : ''}`} role={error ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div className="t">{title}</div>
      {children ? <div>{children}</div> : null}
      {action}
    </div>
  );
}

/** Grey placeholder lines while data loads. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="dt-stack" aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="dt-skeleton" style={{ width: `${90 - index * 15}%` }} />
      ))}
    </div>
  );
}

/** Page title, caption and the page's action buttons. */
export function PageHeader({
  title,
  caption,
  actions,
}: {
  title: ReactNode;
  caption?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="dt-row-flex min-w-0">
        <h1 className="dt-title">{title}</h1>
        {caption ? <span className="dt-cap">{caption}</span> : null}
      </div>
      {actions ? <div className="ms-auto flex gap-2">{actions}</div> : null}
    </div>
  );
}
