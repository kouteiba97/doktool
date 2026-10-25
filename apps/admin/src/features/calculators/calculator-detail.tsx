'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, GitBranchPlus, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, call } from '@/api/client';
import { formatDate } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, PageHeader, Skeleton } from '@/ui/feedback';
import { Field, Select, TextArea } from '@/ui/field';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import { SynonymsEditor } from '../search/synonyms-editor';
import { CalculatorFormDialog } from './calculator-form-dialog';
import { DefinitionPanel } from './definition-panel';
import {
  ACCESS_LABELS,
  type Calculator,
  CALCULATOR_STATUS_LABELS,
  calculatorKey,
  calculatorsKey,
  openDraft,
  publishedVersion,
  type Version,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_TONES,
} from './labels';
import { PreviewPanel } from './preview-panel';
import { ReviewPanel } from './review-panel';
import { SourcesPanel } from './sources-panel';
import { TestsPanel } from './tests-panel';

/** Calculator detail (ScreenCalculatorAdmin): version timeline, and the selected version's tabs. */
export function CalculatorDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [branching, setBranching] = useState(false);

  // The calculator with all its versions.
  const detail = useQuery({
    queryKey: calculatorKey(id),
    queryFn: () => call(api.GET('/admin/v1/calculators/{id}', { params: { path: { id } } })),
  });
  const calculator = detail.data;

  /** After any change to a version: refresh this calculator and the list. */
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: calculatorKey(id) });
    void queryClient.invalidateQueries({ queryKey: calculatorsKey, exact: true });
  };

  if (detail.isPending) return <Skeleton lines={10} />;
  if (detail.isError || !calculator) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(detail.error)}
      </EmptyState>
    );
  }

  // The chosen version, or by default the open draft, else the published one, else the latest.
  const version =
    calculator.versions.find((item) => item.id === selected) ??
    openDraft(calculator) ??
    publishedVersion(calculator) ??
    calculator.versions[0];
  const canDraft = has('calculators.draft');

  return (
    <>
      <Link href="/admin/calculators" className="dt-row-flex dt-cap w-fit">
        <ArrowLeft size={14} aria-hidden />
        {t('admin.calculators.backToList')}
      </Link>
      <PageHeader
        title={locale === 'en' ? calculator.nameEn : calculator.nameFr}
        caption={
          <span className="dt-row-flex">
            <span className="dt-mono">{calculator.slug}</span>
            <Badge tone={calculator.status === 'ACTIVE' ? 'success' : 'outline'}>
              {t(CALCULATOR_STATUS_LABELS[calculator.status])}
            </Badge>
            <Badge tone="neutral">{t(ACCESS_LABELS[calculator.accessTier])}</Badge>
            {calculator.demoSample ? <Badge tone="teal">{t('admin.library.demo')}</Badge> : null}
          </span>
        }
        actions={
          canDraft ? (
            <>
              {/* « Modifier »: names, purpose, category (and access with the publish grant). */}
              <Button onClick={() => setEditing(true)}>
                <Pencil size={16} aria-hidden />
                {t('admin.calculators.edit')}
              </Button>
              {/*
                « Nouvelle version »: a new draft copied from a version or pasted as JSON (only
                one draft at a time).
              */}
              <Button
                variant="primary"
                disabled={openDraft(calculator) !== undefined}
                title={openDraft(calculator) ? t('admin.calculators.draftOpen') : undefined}
                onClick={() => setBranching(true)}
              >
                <GitBranchPlus size={16} aria-hidden />
                {t('admin.calculators.newVersion')}
              </Button>
            </>
          ) : null
        }
      />
      {(calculator.purposeFr || calculator.purposeEn) && (
        <p className="text-ink-secondary">
          {locale === 'en' ? calculator.purposeEn : calculator.purposeFr}
        </p>
      )}

      <div className="grid grid-cols-[var(--size-sidebar)_minmax(0,1fr)] gap-4">
        <nav aria-label={t('admin.calculators.versions')} className="dt-stack">
          <h2 className="dt-label">{t('admin.calculators.versions')}</h2>
          {calculator.versions.length === 0 ? (
            <p className="dt-cap">{t('admin.calculators.noVersions')}</p>
          ) : (
            <ol className="dt-stack gap-1">
              {calculator.versions.map((item) => (
                <li key={item.id}>
                  {/* One version of the timeline: shows its tabs. */}
                  <button
                    type="button"
                    aria-current={item.id === version?.id ? 'true' : undefined}
                    className={`dt-card w-full gap-1 p-3 text-start ${item.id === version?.id ? 'border-brand bg-brand-soft' : ''}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="dt-row-flex">
                      <b>v{item.version}</b>
                      <Badge tone={VERSION_STATUS_TONES[item.status]}>
                        {t(VERSION_STATUS_LABELS[item.status])}
                      </Badge>
                    </span>
                    <span className="dt-cap">
                      {formatDate(locale, item.publishedAt ?? item.createdAt)} ·{' '}
                      {item.authoredBy.fullName}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </nav>
        <div className="min-w-0">
          {version ? (
            <VersionView
              key={version.id}
              calculator={calculator}
              version={version}
              onChanged={refresh}
            />
          ) : (
            <EmptyState icon={GitBranchPlus} title={t('admin.calculators.noVersions')}>
              {t('admin.calculators.noVersionsBody')}
            </EmptyState>
          )}
        </div>
      </div>

      <section className="dt-card" aria-labelledby="calculator-synonyms">
        <h2 id="calculator-synonyms" className="dt-heading">
          {t('admin.synonyms.title')}
        </h2>
        <SynonymsEditor entityType="CALCULATOR" entityId={calculator.id} />
      </section>

      <CalculatorFormDialog
        calculator={calculator}
        open={editing}
        onOpenChange={setEditing}
        onSaved={(saved) => {
          queryClient.setQueryData(calculatorKey(saved.id), saved);
          void queryClient.invalidateQueries({ queryKey: calculatorsKey, exact: true });
          toast(t('admin.calculators.saved'));
        }}
      />
      {branching ? (
        <NewVersionDialog
          calculator={calculator}
          open
          onOpenChange={setBranching}
          onCreated={async (created) => {
            await refresh();
            setSelected(created.id);
            toast(t('admin.calculators.versionCreated', { version: created.version }));
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The selected version: its checksum and the Définition · Sources · Tests · Revue · Aperçu tabs.
 */
function VersionView({
  calculator,
  version,
  onChanged,
}: {
  calculator: Calculator;
  version: Version;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="dt-stack gap-4">
      <div className="dt-row-flex">
        <h2 className="dt-title">
          {t('admin.calculators.versionTitle', { version: version.version })}
        </h2>
        <Badge tone={VERSION_STATUS_TONES[version.status]}>
          {t(VERSION_STATUS_LABELS[version.status])}
        </Badge>
        <span className="dt-cap">
          {t('admin.calculators.authoredBy', {
            name: version.authoredBy.fullName,
            date: formatDate(locale, version.createdAt),
          })}
        </span>
      </div>
      <div className="dt-cap">
        {t('admin.calculators.checksum')}{' '}
        <span className="dt-mono">{version.definitionSha256}</span>
      </div>
      <Tabs defaultValue="definition" className="dt-stack">
        <TabList label={t('admin.calculators.versionTitle', { version: version.version })}>
          <Tab value="definition">{t('admin.calculators.tabDefinition')}</Tab>
          <Tab value="sources">
            {t('admin.calculators.tabSources', { count: version.sources.length })}
          </Tab>
          <Tab value="tests">
            {t('admin.calculators.tabTests', { count: version.testCases.length })}
          </Tab>
          <Tab value="review">{t('admin.calculators.tabReview')}</Tab>
          <Tab value="preview">{t('admin.calculators.tabPreview')}</Tab>
        </TabList>
        <TabPanel value="definition">
          <DefinitionPanel version={version} onChanged={onChanged} />
        </TabPanel>
        <TabPanel value="sources">
          <SourcesPanel version={version} onChanged={onChanged} />
        </TabPanel>
        <TabPanel value="tests">
          <TestsPanel version={version} onChanged={onChanged} />
        </TabPanel>
        <TabPanel value="review">
          <ReviewPanel calculator={calculator} version={version} onChanged={onChanged} />
        </TabPanel>
        <TabPanel value="preview">
          <PreviewPanel key={version.definitionSha256} version={version} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

/**
 * « Nouvelle version »: copy of an earlier version (with sources and tests) or a definition pasted
 * as JSON.
 */
function NewVersionDialog({
  calculator,
  open,
  onOpenChange,
  onCreated,
}: {
  calculator: Calculator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: Version) => Promise<void>;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const latest = calculator.versions[0];
  const [copyFrom, setCopyFrom] = useState<number | null>(latest?.version ?? null);
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Creates the draft; pasted JSON that does not parse is reported before calling the API.
  const create = useMutation({
    mutationFn: async () => {
      let body: { copyFromVersion: number } | { definition: Record<string, unknown> };
      if (copyFrom !== null) {
        body = { copyFromVersion: copyFrom };
      } else {
        try {
          body = { definition: JSON.parse(json) as Record<string, unknown> };
        } catch {
          throw new SyntaxError('json');
        }
      }
      return call(
        api.POST('/admin/v1/calculators/{id}/versions', {
          params: { path: { id: calculator.id } },
          body,
        }),
      );
    },
    onSuccess: async (created) => {
      onOpenChange(false);
      await onCreated(created);
    },
    onError: (failure) =>
      setError(
        failure instanceof SyntaxError ? t('admin.calculators.jsonInvalid') : errorText(failure),
      ),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (create.isPending ? undefined : onOpenChange(next))}
      wide
      title={t('admin.calculators.newVersion')}
      description={t('admin.calculators.newVersionBody')}
      onSubmit={() => create.mutate()}
      footer={
        <>
          {/* « Annuler ». */}
          <Button onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {t('admin.common.cancel')}
          </Button>
          {/* « Créer le brouillon ». */}
          <Button
            type="submit"
            variant="primary"
            busy={create.isPending}
            disabled={copyFrom === null && !json.trim()}
          >
            {t('admin.calculators.createDraft')}
          </Button>
        </>
      }
    >
      <Field label={t('admin.calculators.startFrom')} required>
        {({ inputId }) => (
          <Select
            id={inputId}
            value={copyFrom === null ? 'json' : String(copyFrom)}
            onChange={(event) =>
              setCopyFrom(event.target.value === 'json' ? null : Number(event.target.value))
            }
          >
            {calculator.versions.map((item) => (
              <option key={item.id} value={item.version}>
                {t('admin.calculators.copyOf', { version: item.version })}
              </option>
            ))}
            <option value="json">{t('admin.calculators.fromJson')}</option>
          </Select>
        )}
      </Field>
      {copyFrom === null ? (
        <Field
          label={t('admin.calculators.definitionJson')}
          required
          help={t('admin.calculators.definitionJsonHelp')}
        >
          {({ inputId, describedBy }) => (
            <TextArea
              id={inputId}
              aria-describedby={describedBy}
              mono
              rows={14}
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
          )}
        </Field>
      ) : null}
      {error ? <Alert tone="critical">{error}</Alert> : null}
    </Dialog>
  );
}
