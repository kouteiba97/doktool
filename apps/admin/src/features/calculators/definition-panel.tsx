'use client';

import { useMutation } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { ApiFailure, api, call, fieldErrors } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge, type BadgeTone } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { TextArea } from '@/ui/field';
import { useToast } from '@/ui/toast';
import {
  type DefinitionView,
  formulaText,
  type InputView,
  rangeText,
  readDefinition,
} from './definition';
import type { Version } from './labels';

const SEVERITY_TONES: Record<DefinitionView['interpretation'][number]['severity'], BadgeTone> = {
  info: 'info',
  caution: 'warning',
  warning: 'warning',
  critical: 'critical',
};

/** « Définition »: inputs, formula, bands and limitations; the author edits a draft's JSON. */
export function DefinitionPanel({
  version,
  onChanged,
}: {
  version: Version;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const { has } = useGrants();
  const [editing, setEditing] = useState(false);
  const [json, setJson] = useState('');
  const [problems, setProblems] = useState<[string, string[]][]>([]);
  const [error, setError] = useState<string | null>(null);
  const definition = readDefinition(version.definition);
  const editable = version.status === 'DRAFT' && has('calculators.draft');

  const save = useMutation({
    mutationFn: async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(json) as Record<string, unknown>;
      } catch {
        throw new SyntaxError('json');
      }
      return call(
        api.PUT('/admin/v1/calculators/versions/{versionId}/definition', {
          params: { path: { versionId: version.id } },
          body: { definition: parsed },
        }),
      );
    },
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
      toast(t('admin.calculators.definitionSaved'));
    },
    onError: (failure) => {
      setProblems(Object.entries(fieldErrors(failure)));
      setError(
        failure instanceof SyntaxError
          ? t('admin.calculators.jsonInvalid')
          : failure instanceof ApiFailure && failure.code === 'VALIDATION_FAILED'
            ? t('admin.calculators.definitionInvalid')
            : errorText(failure),
      );
    },
  });

  if (editing) {
    return (
      <div className="dt-stack">
        <Alert tone="info">{t('admin.calculators.editDefinitionNotice')}</Alert>
        <TextArea
          aria-label={t('admin.calculators.definitionJson')}
          mono
          rows={24}
          value={json}
          onChange={(event) => setJson(event.target.value)}
        />
        {error ? (
          <Alert tone="critical" title={error}>
            {problems.length > 0 ? (
              <ul className="dt-stack gap-1">
                {problems.map(([path, messages]) => (
                  <li key={path} className="dt-mono whitespace-normal">
                    {path}: {messages.join(' · ')}
                  </li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
        <div className="flex gap-2">
          <Button variant="primary" busy={save.isPending} onClick={() => save.mutate()}>
            {t('admin.calculators.saveDefinition')}
          </Button>
          <Button disabled={save.isPending} onClick={() => setEditing(false)}>
            {t('admin.common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  const labelOf = (key: string) => {
    const input = definition?.inputs.find((item) => item.key === key);
    return input ? input.label[locale] : key;
  };

  return (
    <div className="dt-stack gap-4">
      {editable ? (
        <div>
          <Button
            size="sm"
            onClick={() => {
              setJson(JSON.stringify(version.definition, null, 2));
              setProblems([]);
              setError(null);
              setEditing(true);
            }}
          >
            <Pencil size={14} aria-hidden />
            {t('admin.calculators.editDefinition')}
          </Button>
        </div>
      ) : null}
      {!definition ? (
        <Alert tone="warning">{t('admin.calculators.definitionUnreadable')}</Alert>
      ) : (
        <>
          <section className="dt-stack">
            <h3 className="dt-heading">{t('admin.calculators.inputs')}</h3>
            <div className="overflow-x-auto">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th scope="col">{t('admin.calculators.inputLabel')}</th>
                    <th scope="col">{t('admin.calculators.inputKind')}</th>
                    <th scope="col">{t('admin.calculators.inputUnits')}</th>
                    <th scope="col">{t('admin.calculators.hardRange')}</th>
                    <th scope="col">{t('admin.calculators.validatedRange')}</th>
                    <th scope="col">{t('admin.calculators.plausibleRange')}</th>
                  </tr>
                </thead>
                <tbody>
                  {definition.inputs.map((input) => (
                    <InputRow key={input.key} input={input} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="dt-stack">
            <h3 className="dt-heading">{t('admin.calculators.formula')}</h3>
            <p className="dt-code">{formulaText(definition.formula, labelOf)}</p>
            <p className="dt-cap">
              {t('admin.calculators.resultShape', {
                label: definition.result.label[locale],
                unit: definition.result.unit,
                decimals: definition.result.decimals,
              })}
            </p>
          </section>
          {definition.crossFieldRules.length > 0 ? (
            <section className="dt-stack">
              <h3 className="dt-heading">{t('admin.calculators.crossFieldRules')}</h3>
              <ul className="dt-stack gap-2">
                {definition.crossFieldRules.map((rule) => (
                  <li key={rule.id} className="dt-stack gap-1">
                    <span className="dt-code">{formulaText(rule.when, labelOf)}</span>
                    <span className="dt-cap">
                      {rule.outcome} · {rule.message[locale]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {definition.interpretation.length > 0 ? (
            <section className="dt-stack">
              <h3 className="dt-heading">{t('admin.calculators.bands')}</h3>
              <table className="dt-table">
                <thead>
                  <tr>
                    <th scope="col">{t('admin.calculators.bandRange')}</th>
                    <th scope="col">{t('admin.calculators.bandLabel')}</th>
                    <th scope="col">{t('admin.calculators.bandSeverity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {definition.interpretation.map((band) => (
                    <tr key={band.code}>
                      <td className="dt-mono">
                        {band.from ?? '−∞'} ≤ x &lt; {band.to ?? '+∞'}
                      </td>
                      <td>
                        {band.label.fr}
                        <div className="dt-cap">{band.label.en}</div>
                      </td>
                      <td>
                        <Badge tone={SEVERITY_TONES[band.severity]}>{band.severity}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          <section className="dt-stack">
            <h3 className="dt-heading">{t('admin.calculators.limitations')}</h3>
            <dl className="dt-dl">
              <dt>FR</dt>
              <dd>{definition.limitations.fr}</dd>
              <dt>EN</dt>
              <dd>{definition.limitations.en}</dd>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

function InputRow({ input }: { input: InputView }) {
  const { t } = useI18n();
  const numeric = input.kind === 'NUMBER' || input.kind === 'INTEGER';
  return (
    <tr>
      <td>
        <b>{input.label.fr}</b>
        <div className="dt-cap">
          {input.label.en} · <span className="dt-mono">{input.key}</span>
          {input.required ? '' : ` · ${t('admin.common.optional')}`}
        </div>
      </td>
      <td className="dt-mono">{input.kind}</td>
      <td>
        {numeric ? (
          <span className="dt-mono">
            {[
              input.canonicalUnit,
              ...input.units.map((unit) => `${unit.code} (×${unit.factorToCanonical})`),
            ].join(', ')}
          </span>
        ) : input.kind === 'CHOICE' ? (
          <span className="dt-cap">
            {input.choices
              .map((choice) =>
                choice.points === undefined
                  ? choice.label.fr
                  : `${choice.label.fr} (${choice.points})`,
              )
              .join(' · ')}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="dt-mono">{numeric ? rangeText(input.hardRange) : '—'}</td>
      <td className="dt-mono">{numeric ? rangeText(input.validatedRange) : '—'}</td>
      <td className="dt-mono">{numeric ? rangeText(input.plausibleRange) : '—'}</td>
    </tr>
  );
}
