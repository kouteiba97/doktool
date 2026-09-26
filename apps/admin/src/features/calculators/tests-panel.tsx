'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Play, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api, call } from '@/api/client';
import { formatDateTime, formatNumber } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Select, TextArea, TextInput } from '@/ui/field';
import { useToast } from '@/ui/toast';
import { currentRun } from './definition';
import { OUTCOME_LABELS, type TestOutcome, type Version } from './labels';

const OUTCOMES: TestOutcome[] = ['RESULT', 'INVALID', 'OUT_OF_VALIDATED_RANGE'];

/** « Tests »: every case with expected vs backend engine result, engine version and run time. */
export function TestsPanel({
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
  const [adding, setAdding] = useState(false);
  const run = currentRun(version.testRun, version.definitionSha256);
  const stale = version.testRun !== null && run === null;
  const results = new Map(run?.results.map((result) => [result.testCaseId, result]));
  const canRun =
    (version.status === 'DRAFT' || version.status === 'IN_REVIEW') && has('calculators.read');
  const editable = version.status === 'DRAFT' && has('calculators.draft');

  const runTests = useMutation({
    mutationFn: () =>
      call(
        api.POST('/admin/v1/calculators/versions/{versionId}/test-run', {
          params: { path: { versionId: version.id } },
        }),
      ),
    onSuccess: async () => {
      await onChanged();
      toast(t('admin.calculators.testsRan'));
    },
    onError: (error) => toast(errorText(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: (testCaseId: string) =>
      call(
        api.DELETE('/admin/v1/calculators/versions/{versionId}/test-cases/{testCaseId}', {
          params: { path: { versionId: version.id, testCaseId } },
        }),
      ),
    onSuccess: () => onChanged(),
    onError: (error) => toast(errorText(error), 'error'),
  });

  const expectation = (
    outcome: TestOutcome,
    value: number | null,
    tolerance: number | null,
    band: string | null,
  ) =>
    outcome === 'RESULT'
      ? `${value === null ? '—' : formatNumber(locale, value)} ± ${formatNumber(locale, tolerance ?? 0)}${band ? ` · ${band}` : ''}`
      : t(OUTCOME_LABELS[outcome]);

  return (
    <div className="dt-stack">
      <div className="dt-row-flex">
        {run ? (
          <Badge tone={run.passed ? 'success' : 'critical'}>
            {run.passed ? <Check aria-hidden /> : <X aria-hidden />}
            {run.passed
              ? t('admin.calculators.runPassed', { total: run.total })
              : t('admin.calculators.runFailed', { failed: run.failed, total: run.total })}
          </Badge>
        ) : (
          <Badge tone="neutral">{t('admin.calculators.runNone')}</Badge>
        )}
        {run ? (
          <span className="dt-cap">
            {t('admin.calculators.runMeta', {
              date: formatDateTime(locale, run.ranAt),
              engine: run.engineVersion,
            })}
          </span>
        ) : null}
        <div className="ms-auto flex gap-2">
          {editable ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden />
              {t('admin.calculators.addTestCase')}
            </Button>
          ) : null}
          {canRun ? (
            <Button
              size="sm"
              variant="primary"
              busy={runTests.isPending}
              onClick={() => runTests.mutate()}
            >
              <Play size={14} aria-hidden />
              {t('admin.calculators.runTests')}
            </Button>
          ) : null}
        </div>
      </div>
      {stale ? <Alert tone="warning">{t('admin.calculators.runStale')}</Alert> : null}
      {version.testCases.length === 0 ? (
        <Alert tone="warning">{t('admin.calculators.noTestCases')}</Alert>
      ) : (
        <div className="overflow-x-auto">
          <table className="dt-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.calculators.caseOrigin')}</th>
                <th scope="col">{t('admin.calculators.caseInputs')}</th>
                <th scope="col">{t('admin.calculators.caseExpected')}</th>
                <th scope="col">{t('admin.calculators.caseActual')}</th>
                {editable ? <th scope="col" aria-label={t('admin.common.actions')} /> : null}
              </tr>
            </thead>
            <tbody>
              {version.testCases.map((testCase) => {
                const result = results.get(testCase.id);
                return (
                  <tr key={testCase.id}>
                    <td>{testCase.origin}</td>
                    <td className="dt-mono whitespace-normal break-all">
                      {JSON.stringify(testCase.inputs)}
                    </td>
                    <td className="nw">
                      {expectation(
                        testCase.expectedOutcome,
                        testCase.expectedValue,
                        testCase.tolerance,
                        testCase.expectedBand,
                      )}
                    </td>
                    <td>
                      {result ? (
                        <div className="dt-stack gap-1">
                          <span className="dt-row-flex">
                            <Badge tone={result.passed ? 'success' : 'critical'}>
                              {result.passed
                                ? t('admin.calculators.casePassed')
                                : t('admin.calculators.caseFailed')}
                            </Badge>
                            {result.actualValue !== null
                              ? `${formatNumber(locale, result.actualValue)}${result.actualBand ? ` · ${result.actualBand}` : ''}`
                              : result.actualOutcome}
                          </span>
                          {result.failure ? (
                            <span className="dt-cap dt-mono whitespace-normal">
                              {result.failure}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    {editable ? (
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon
                          aria-label={t('admin.calculators.removeTestCase')}
                          busy={remove.isPending && remove.variables === testCase.id}
                          onClick={() => remove.mutate(testCase.id)}
                        >
                          <Trash2 size={14} aria-hidden />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding ? (
        <AddTestCaseDialog version={version} open onOpenChange={setAdding} onAdded={onChanged} />
      ) : null}
    </div>
  );
}

function AddTestCaseDialog({
  version,
  open,
  onOpenChange,
  onAdded,
}: {
  version: Version;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => Promise<void>;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [origin, setOrigin] = useState('');
  const [inputs, setInputs] = useState('{\n  \n}');
  const [outcome, setOutcome] = useState<TestOutcome>('RESULT');
  const [value, setValue] = useState('');
  const [tolerance, setTolerance] = useState('');
  const [band, setBand] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(inputs);
      } catch {
        throw new SyntaxError('json');
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new SyntaxError('json');
      const result = outcome === 'RESULT';
      return call(
        api.POST('/admin/v1/calculators/versions/{versionId}/test-cases', {
          params: { path: { versionId: version.id } },
          body: {
            origin: origin.trim(),
            inputs: parsed as Record<string, never>,
            expectedOutcome: outcome,
            expectedValue: result ? Number(value) : null,
            tolerance: result ? Number(tolerance) : null,
            expectedBand: result && band.trim() ? band.trim() : null,
          },
        }),
      );
    },
    onSuccess: async () => {
      onOpenChange(false);
      await onAdded();
    },
    onError: (failure) =>
      setError(
        failure instanceof SyntaxError
          ? t('admin.calculators.caseInputsInvalid')
          : errorText(failure),
      ),
  });

  const numbersValid =
    outcome !== 'RESULT' ||
    (value.trim() !== '' &&
      Number.isFinite(Number(value)) &&
      tolerance.trim() !== '' &&
      Number(tolerance) >= 0);
  const ready = origin.trim().length > 0 && numbersValid;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (add.isPending ? undefined : onOpenChange(next))}
      wide
      title={t('admin.calculators.addTestCase')}
      description={t('admin.calculators.addTestCaseBody')}
      onSubmit={() => add.mutate()}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={add.isPending}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="submit" variant="primary" busy={add.isPending} disabled={!ready}>
            {t('admin.calculators.addTestCase')}
          </Button>
        </>
      }
    >
      <Field
        label={t('admin.calculators.caseOrigin')}
        required
        help={t('admin.calculators.caseOriginHelp')}
      >
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            maxLength={300}
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
          />
        )}
      </Field>
      <Field
        label={t('admin.calculators.caseInputs')}
        required
        help={t('admin.calculators.caseInputsHelp')}
      >
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            mono
            rows={6}
            value={inputs}
            onChange={(event) => setInputs(event.target.value)}
          />
        )}
      </Field>
      <Field label={t('admin.calculators.caseOutcome')} required>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as TestOutcome)}
          >
            {OUTCOMES.map((item) => (
              <option key={item} value={item}>
                {t(OUTCOME_LABELS[item])}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {outcome === 'RESULT' ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('admin.calculators.caseValue')} required>
            {({ inputId }) => (
              <TextInput
                id={inputId}
                type="number"
                step="any"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.calculators.caseTolerance')} required>
            {({ inputId }) => (
              <TextInput
                id={inputId}
                type="number"
                step="any"
                min={0}
                value={tolerance}
                onChange={(event) => setTolerance(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.calculators.caseBand')}>
            {({ inputId }) => (
              <TextInput
                id={inputId}
                mono
                maxLength={40}
                value={band}
                onChange={(event) => setBand(event.target.value)}
              />
            )}
          </Field>
        </div>
      ) : null}
      {error ? <Alert tone="critical">{error}</Alert> : null}
    </Dialog>
  );
}
