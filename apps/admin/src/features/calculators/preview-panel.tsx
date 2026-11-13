'use client';

import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, call } from '@/api/client';
import { formatNumber } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { Locale } from '@/i18n/messages';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Select, Switch, TextInput } from '@/ui/field';
import { type InputView, readDefinition } from './definition';
import { OUTCOME_LABELS, type Version } from './labels';

/** What the admin typed in one preview field, and its unit. */
interface FieldState {
  value: string;
  unit: string;
}

/** Evaluation inputs of the API (`{ key: { value, unit? } }`); blank fields are left out. */
export function toEvaluationInputs(
  inputs: InputView[],
  state: Record<string, FieldState>,
): Record<string, { value: number | string | boolean; unit?: string }> {
  const out: Record<string, { value: number | string | boolean; unit?: string }> = {};
  for (const input of inputs) {
    const field = state[input.key];
    if (!field) continue;
    if (input.kind === 'BOOLEAN') {
      out[input.key] = { value: field.value === 'true' };
    } else if (input.kind === 'CHOICE') {
      if (field.value) out[input.key] = { value: field.value };
    } else if (field.value.trim() !== '') {
      out[input.key] = { value: Number(field.value.replace(',', '.')), unit: field.unit };
    }
  }
  return out;
}

/** Empty preview fields (booleans false, numbers in their canonical unit). */
function initialState(inputs: InputView[]): Record<string, FieldState> {
  return Object.fromEntries(
    inputs.map((input) => [
      input.key,
      {
        value: input.kind === 'BOOLEAN' ? 'false' : '',
        unit: input.kind === 'NUMBER' || input.kind === 'INTEGER' ? input.canonicalUnit : '',
      },
    ]),
  );
}

/**
 * « Aperçu »: live preview with the backend engine (the authoritative one). Test inputs here are
 * the admin's own, not patient data, and are not stored.
 */
export function PreviewPanel({ version }: { version: Version }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const definition = useMemo(() => readDefinition(version.definition), [version.definition]);
  const [state, setState] = useState<Record<string, FieldState>>(() =>
    initialState(definition?.inputs ?? []),
  );

  // Runs the version on the API's engine with the typed values (never stored).
  const evaluate = useMutation({
    mutationFn: () =>
      call(
        api.POST('/admin/v1/calculators/versions/{versionId}/preview', {
          params: { path: { versionId: version.id } },
          body: {
            inputs: toEvaluationInputs(definition?.inputs ?? [], state) as Record<string, never>,
          },
        }),
      ),
  });

  if (!definition)
    return <Alert tone="warning">{t('admin.calculators.definitionUnreadable')}</Alert>;
  // Updates one field of the preview.
  const set = (key: string, patch: Partial<FieldState>) =>
    setState((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { value: '', unit: '' }), ...patch },
    }));
  const result = evaluate.data;

  return (
    <div className="grid grid-cols-2 gap-4">
      <form
        className="dt-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          evaluate.mutate();
        }}
      >
        {definition.inputs.map((input) => (
          <PreviewField
            key={input.key}
            input={input}
            locale={locale}
            state={state[input.key]}
            onChange={(patch) => set(input.key, patch)}
          />
        ))}
        <div>
          {/* « Calculer »: evaluates on the server. */}
          <Button type="submit" variant="primary" busy={evaluate.isPending}>
            {t('admin.calculators.calculate')}
          </Button>
        </div>
      </form>
      <div className="dt-stack" aria-live="polite">
        {evaluate.isError ? <Alert tone="critical">{errorText(evaluate.error)}</Alert> : null}
        {result ? (
          result.outcome === 'RESULT' && result.value !== undefined ? (
            <div className="dt-card bg-teal-soft">
              <span className="dt-label">{definition.result.label[locale]}</span>
              <span className="text-result">
                {formatNumber(locale, result.value, result.decimals ?? definition.result.decimals)}{' '}
                <span className="text-heading">{result.unit}</span>
              </span>
              {result.band ? <Badge tone="teal">{result.band.label[locale]}</Badge> : null}
              {result.conversions.map((conversion) => (
                <span key={conversion.input} className="dt-cap">
                  {t('admin.calculators.converted', { input: conversion.input })}
                </span>
              ))}
            </div>
          ) : (
            <Alert tone="warning" title={t(OUTCOME_LABELS[result.outcome])}>
              <ul className="dt-stack gap-1">
                {(result.issues ?? []).map((issue, index) => (
                  <li key={index}>
                    {issue.message ? issue.message[locale] : null}
                    <span className="dt-mono dt-cap">
                      {' '}
                      {issue.code}
                      {issue.input ? ` · ${issue.input}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Alert>
          )
        ) : (
          <p className="dt-cap">{t('admin.calculators.previewHelp')}</p>
        )}
      </div>
    </div>
  );
}

/** One preview field: a switch, a list of answers, or a number with its unit picker. */
function PreviewField({
  input,
  locale,
  state,
  onChange,
}: {
  input: InputView;
  locale: Locale;
  state: FieldState | undefined;
  onChange: (patch: Partial<FieldState>) => void;
}) {
  const { t } = useI18n();
  const label = input.label[locale];
  if (input.kind === 'BOOLEAN') {
    return (
      <Switch
        checked={state?.value === 'true'}
        onChange={(checked) => onChange({ value: String(checked) })}
        label={label}
      />
    );
  }
  if (input.kind === 'CHOICE') {
    return (
      <Field label={label} required={input.required}>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={state?.value ?? ''}
            onChange={(event) => onChange({ value: event.target.value })}
          >
            <option value="">{t('admin.common.choose')}</option>
            {input.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label[locale]}
              </option>
            ))}
          </Select>
        )}
      </Field>
    );
  }
  const units = [input.canonicalUnit, ...input.units.map((unit) => unit.code)];
  return (
    <Field label={label} required={input.required}>
      {({ inputId }) => (
        <div className="flex gap-2">
          <TextInput
            id={inputId}
            inputMode="decimal"
            value={state?.value ?? ''}
            onChange={(event) => onChange({ value: event.target.value })}
            unit={units.length === 1 ? units[0] : undefined}
          />
          {units.length > 1 ? (
            <div className="shrink-0 basis-1/3">
              <Select
                aria-label={t('admin.calculators.unit')}
                value={state?.unit ?? units[0]}
                onChange={(event) => onChange({ unit: event.target.value })}
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}
