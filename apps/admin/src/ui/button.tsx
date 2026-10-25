import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Visual styles of a button (primary, secondary, ghost, danger, teal). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'teal';

/** A button: style, size, icon-only, and a busy spinner that also disables it. */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** Square icon button; `aria-label` is then required. */
  icon?: boolean;
  busy?: boolean;
  children: ReactNode;
}

/** The console's button; disabled while busy so a click is never sent twice. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon = false,
  busy = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'dt-btn',
    variant,
    size === 'sm' ? 'sm' : '',
    icon ? 'icon' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} disabled={disabled || busy} aria-busy={busy} {...rest}>
      {busy ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : null}
      {children}
    </button>
  );
}
