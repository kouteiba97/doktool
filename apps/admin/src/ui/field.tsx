'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { useI18n } from '@/i18n/i18n-provider';

/**
 * A form field: label, required mark, help or error text, and the control (given the ids to wire).
 */
interface FieldProps {
  label: ReactNode;
  required?: boolean;
  help?: ReactNode;
  error?: string;
  children: (ids: {
    inputId: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

/** Label + control + help/error, wired for assistive technology. */
export function Field({ label, required, help, error, children }: FieldProps) {
  const { t } = useI18n();
  const inputId = useId();
  const helpId = useId();
  const describedBy = error || help ? helpId : undefined;
  return (
    <div className="dt-field">
      <label className="dt-label" htmlFor={inputId}>
        {label}
        {required ? (
          <span className="req" aria-hidden>
            {' *'}
          </span>
        ) : (
          <span className="dt-cap"> · {t('admin.common.optional')}</span>
        )}
      </label>
      {children({ inputId, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={helpId} className="dt-help error" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={helpId} className="dt-help">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** Extra options of the inputs below. */
type Invalid = { invalid?: boolean; unit?: ReactNode; mono?: boolean };

/** A text input with an optional unit at its end. */
export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & Invalid
>(function TextInput({ invalid, unit, mono, readOnly, className, ...rest }, ref) {
  return (
    <div className={`dt-input${invalid ? ' error' : ''}${readOnly ? ' readonly' : ''}`}>
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        readOnly={readOnly}
        className={`${mono ? 'dt-mono' : ''} ${className ?? ''}`}
        {...rest}
      />
      {unit ? <span className="unit">{unit}</span> : null}
    </div>
  );
});

/** A multi-line input (monospace for JSON). */
export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid
>(function TextArea({ invalid, mono, ...rest }, ref) {
  return (
    <div className={`dt-input dt-textarea${mono ? ' code' : ''}${invalid ? ' error' : ''}`}>
      <textarea ref={ref} aria-invalid={invalid || undefined} spellCheck={!mono} {...rest} />
    </div>
  );
});

/** A drop-down list. */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & Invalid
>(function Select({ invalid, children, ...rest }, ref) {
  return (
    <div className={`dt-input${invalid ? ' error' : ''}`}>
      <select ref={ref} aria-invalid={invalid || undefined} {...rest}>
        {children}
      </select>
    </div>
  );
});

/** An on/off switch (role="switch", readable by screen readers). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      className="dt-switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="track" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
