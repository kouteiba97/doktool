'use client';

import { useMutation } from '@tanstack/react-query';
import { Plus, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Select, Switch, TextArea, TextInput } from '@/ui/field';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import {
  type ClinicalSource,
  type Conduct,
  CONDUCT_LABELS,
  CONDUCTS,
  emptyLactation,
  emptyPeriod,
  emptyPregnancy,
  EVIDENCE_LABELS,
  type LactationBlock,
  type Localized,
  type Period,
  PERIOD_LABELS,
  PERIODS,
  type PeriodKey,
  type PregnancyBlock,
  type ProfileContent,
  type ProfileVersion,
  sourceCitation,
  type Substance,
} from './labels';
import { ProfileView } from './profile-view';

/** A disagreement between two sources. */
type Conflict = NonNullable<PregnancyBlock['conflict']>;

/** Drops empty texts so the server receives only what the author wrote. */
function cleanText(text: Localized | undefined): Localized | undefined {
  const fr = text?.fr.trim() ?? '';
  const en = text?.en?.trim() ?? '';
  if (!fr) return undefined;
  return en ? { fr, en } : { fr };
}

/** Import traceability (ADR-025) is kept as is: status word, period sources and alternatives. */
function keepImported<T extends Period | LactationBlock>(value: T) {
  return {
    ...(value.reportedStatus ? { reportedStatus: value.reportedStatus } : {}),
    ...(value.sourceIds?.length ? { sourceIds: value.sourceIds } : {}),
    ...(value.unresolvedAlternatives?.length
      ? { unresolvedAlternatives: value.unresolvedAlternatives }
      : {}),
  };
}

/** A period without its empty optional parts (sent to the API). */
function cleanPeriod(period: Period): Period {
  return {
    conduct: period.conduct,
    ...keepImported(period),
    ...(period.alternatives?.length ? { alternatives: period.alternatives } : {}),
    ...(period.conduct && cleanText(period.conductDetail)
      ? { conductDetail: cleanText(period.conductDetail) }
      : {}),
    ...(cleanText(period.riskContext) ? { riskContext: cleanText(period.riskContext) } : {}),
    evidence: {
      level: period.evidence.level,
      ...(cleanText(period.evidence.population)
        ? { population: cleanText(period.evidence.population) }
        : {}),
    },
    ...(cleanText(period.considerations)
      ? { considerations: cleanText(period.considerations) }
      : {}),
  };
}

/** A conflict without empty parts, or nothing when unset. */
function cleanConflict(conflict: Conflict | undefined): Conflict | undefined {
  const synthesis = cleanText(conflict?.synthesis);
  if (!conflict || !synthesis || conflict.sourceIds.length !== 2) return undefined;
  return { sourceIds: conflict.sourceIds, synthesis };
}

export function cleanContent(content: ProfileContent): ProfileContent {
  const pregnancy = content.pregnancy;
  const lactation = content.lactation;
  return {
    pregnancy: pregnancy
      ? {
          periods: Object.fromEntries(
            PERIODS.map((key) => [
              key,
              pregnancy.periods[key] ? cleanPeriod(pregnancy.periods[key]) : null,
            ]),
          ) as PregnancyBlock['periods'],
          alternatives: pregnancy.alternatives,
          ...(cleanConflict(pregnancy.conflict)
            ? { conflict: cleanConflict(pregnancy.conflict) }
            : {}),
        }
      : null,
    lactation: lactation
      ? {
          conduct: lactation.conduct,
          ...keepImported(lactation),
          ...(cleanText(lactation.conductText)
            ? { conductText: cleanText(lactation.conductText) }
            : {}),
          ...(lactation.relativeInfantDose?.trim()
            ? { relativeInfantDose: lactation.relativeInfantDose.trim() }
            : {}),
          ...(lactation.maternalHalfLife?.trim()
            ? { maternalHalfLife: lactation.maternalHalfLife.trim() }
            : {}),
          ...(cleanText(lactation.reportedEffects)
            ? { reportedEffects: cleanText(lactation.reportedEffects) }
            : {}),
          ...(cleanText(lactation.specialPopulations)
            ? { specialPopulations: cleanText(lactation.specialPopulations) }
            : {}),
          evidence: {
            level: lactation.evidence.level,
            ...(cleanText(lactation.evidence.population)
              ? { population: cleanText(lactation.evidence.population) }
              : {}),
          },
          ...(cleanText(lactation.considerations)
            ? { considerations: cleanText(lactation.considerations) }
            : {}),
          alternatives: lactation.alternatives,
          ...(cleanConflict(lactation.conflict)
            ? { conflict: cleanConflict(lactation.conflict) }
            : {}),
        }
      : null,
  };
}

/** French (required when the field is used) and English side by side. */
function LocalizedField({
  label,
  help,
  value,
  onChange,
  disabled,
  rows = 2,
}: {
  label: string;
  help?: string;
  value: Localized | undefined;
  onChange: (value: Localized | undefined) => void;
  disabled: boolean;
  rows?: number;
}) {
  const { t } = useI18n();
  return (
    <Field label={label} help={help}>
      {({ inputId, describedBy }) => (
        <div className="grid grid-cols-2 gap-2">
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            aria-label={`${label} · FR`}
            placeholder={t('admin.pregnancy.frenchPlaceholder')}
            rows={rows}
            disabled={disabled}
            value={value?.fr ?? ''}
            onChange={(event) => onChange({ fr: event.target.value, en: value?.en })}
          />
          <TextArea
            aria-label={`${label} · EN`}
            placeholder={t('admin.pregnancy.englishPlaceholder')}
            rows={rows}
            disabled={disabled}
            value={value?.en ?? ''}
            onChange={(event) => onChange({ fr: value?.fr ?? '', en: event.target.value })}
          />
        </div>
      )}
    </Field>
  );
}

/** The conduct picker of a period. */
function ConductSelect({
  value,
  onChange,
  disabled,
}: {
  value: Conduct | null;
  onChange: (value: Conduct | null) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <Field label={t('admin.pregnancy.conductBadge')} help={t('admin.pregnancy.conductBadgeHelp')}>
      {({ inputId, describedBy }) => (
        <Select
          id={inputId}
          aria-describedby={describedBy}
          disabled={disabled}
          value={value ?? ''}
          onChange={(event) => onChange((event.target.value || null) as Conduct | null)}
        >
          <option value="">{t('admin.pregnancy.conductNone')}</option>
          {CONDUCTS.map((conduct) => (
            <option key={conduct} value={conduct}>
              {t(CONDUCT_LABELS[conduct])}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Evidence level and its note. */
function EvidenceFields({
  value,
  onChange,
  disabled,
}: {
  value: Period['evidence'];
  onChange: (value: Period['evidence']) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-3">
      <Field label={t('admin.pregnancy.evidence')} required>
        {({ inputId }) => (
          <Select
            id={inputId}
            disabled={disabled}
            value={value.level === null ? '' : String(value.level)}
            onChange={(event) =>
              onChange({
                ...value,
                level: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          >
            {value.level === null ? (
              <option value="">{t('admin.pregnancy.evidenceMissing')}</option>
            ) : null}
            {[4, 3, 2, 1, 0].map((level) => (
              <option key={level} value={level}>
                {level} · {t(EVIDENCE_LABELS[level]!)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <LocalizedField
        label={t('admin.pregnancy.population')}
        help={t('admin.pregnancy.populationHelp')}
        rows={1}
        disabled={disabled}
        value={value.population}
        onChange={(population) => onChange({ ...value, population })}
      />
    </div>
  );
}

/** Other substances, as chips; a substance is never its own alternative. */
function AlternativesField({
  value,
  onChange,
  substances,
  selfId,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  substances: Substance[];
  selfId: string;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  // A substance's name in the UI language.
  const name = (id: string) => {
    const found = substances.find((item) => item.id === id);
    return found ? (locale === 'en' && found.nameEn ? found.nameEn : found.nameFr) : id;
  };
  const candidates = substances.filter((item) => item.id !== selfId && !value.includes(item.id));
  return (
    <Field label={t('admin.pregnancy.alternatives')} help={t('admin.pregnancy.alternativesHelp')}>
      {({ inputId, describedBy }) => (
        <div className="dt-stack gap-2">
          <div className="dt-row-flex">
            {value.map((id) => (
              <span key={id} className="dt-chip">
                {name(id)}
                {disabled ? null : (
                  // Removes this alternative.
                  <button
                    type="button"
                    aria-label={t('admin.pregnancy.removeAlternative', { name: name(id) })}
                    onClick={() => onChange(value.filter((item) => item !== id))}
                  >
                    <X size={12} aria-hidden />
                  </button>
                )}
              </span>
            ))}
          </div>
          {disabled ? null : (
            <Select
              id={inputId}
              aria-describedby={describedBy}
              value=""
              onChange={(event) => {
                if (event.target.value) onChange([...value, event.target.value]);
              }}
            >
              <option value="">{t('admin.pregnancy.addAlternative')}</option>
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {locale === 'en' && item.nameEn ? item.nameEn : item.nameFr}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
    </Field>
  );
}

/** Two references that disagree, and the reviewers' synthesis (info Alert for doctors). */
function ConflictFields({
  value,
  onChange,
  sources,
  disabled,
}: {
  value: Conflict | undefined;
  onChange: (value: Conflict | undefined) => void;
  sources: ClinicalSource[];
  disabled: boolean;
}) {
  const { t } = useI18n();
  const ids = value?.sourceIds ?? ['', ''];
  // Sets one of the two sources of the conflict.
  const set = (index: number, id: string) => {
    const next = [...ids];
    next[index] = id;
    onChange({ sourceIds: next, synthesis: value?.synthesis ?? { fr: '' } });
  };
  return (
    <div className="dt-stack gap-2">
      <Switch
        checked={value !== undefined}
        disabled={disabled}
        onChange={(on) => onChange(on ? { sourceIds: ['', ''], synthesis: { fr: '' } } : undefined)}
        label={t('admin.pregnancy.conflictToggle')}
      />
      {value ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((index) => (
              <Field
                key={index}
                label={t('admin.pregnancy.conflictSource', { n: index + 1 })}
                required
              >
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    disabled={disabled}
                    value={ids[index] ?? ''}
                    onChange={(event) => set(index, event.target.value)}
                  >
                    <option value="">{t('admin.pregnancy.chooseSource')}</option>
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {sourceCitation(source)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
          <LocalizedField
            label={t('admin.pregnancy.conflictSynthesis')}
            disabled={disabled}
            value={value.synthesis}
            onChange={(synthesis) => onChange({ ...value, synthesis: synthesis ?? { fr: '' } })}
          />
        </>
      ) : null}
    </div>
  );
}

/** The fields of one pregnancy period. */
function PeriodFields({
  periodKey,
  value,
  onChange,
  disabled,
}: {
  periodKey: PeriodKey;
  value: Period | null;
  onChange: (value: Period | null) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="dt-card dt-stack gap-3 p-4">
      <legend className="dt-heading">{t(PERIOD_LABELS[periodKey])}</legend>
      <Switch
        checked={value !== null}
        disabled={disabled}
        onChange={(on) => onChange(on ? emptyPeriod() : null)}
        label={t('admin.pregnancy.periodFilled')}
      />
      {value ? (
        <>
          <EvidenceFields
            value={value.evidence}
            disabled={disabled}
            onChange={(evidence) => onChange({ ...value, evidence })}
          />
          {value.evidence.level === 0 ? (
            <Alert tone="info">{t('admin.pregnancy.noDataEditorHelp')}</Alert>
          ) : null}
          <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-3">
            <ConductSelect
              value={value.conduct}
              disabled={disabled}
              onChange={(conduct) => onChange({ ...value, conduct })}
            />
            {value.conduct ? (
              <LocalizedField
                label={t('admin.pregnancy.conductDetail')}
                help={t('admin.pregnancy.conductDetailHelp')}
                disabled={disabled}
                value={value.conductDetail}
                onChange={(conductDetail) => onChange({ ...value, conductDetail })}
              />
            ) : (
              <span />
            )}
          </div>
          <LocalizedField
            label={t('admin.pregnancy.riskContext')}
            disabled={disabled}
            rows={3}
            value={value.riskContext}
            onChange={(riskContext) => onChange({ ...value, riskContext })}
          />
          <LocalizedField
            label={t('admin.pregnancy.considerations')}
            disabled={disabled}
            rows={3}
            value={value.considerations}
            onChange={(considerations) => onChange({ ...value, considerations })}
          />
        </>
      ) : null}
    </fieldset>
  );
}

/** The pregnancy block: four periods and its alternatives. */
function PregnancyFields({
  value,
  onChange,
  substances,
  selfId,
  sources,
  disabled,
}: {
  value: PregnancyBlock | null;
  onChange: (value: PregnancyBlock | null) => void;
  substances: Substance[];
  selfId: string;
  sources: ClinicalSource[];
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="dt-stack gap-3">
      <Switch
        checked={value !== null}
        disabled={disabled}
        onChange={(on) => onChange(on ? emptyPregnancy() : null)}
        label={t('admin.pregnancy.blockFilled')}
      />
      {value ? (
        <>
          {PERIODS.map((key) => (
            <PeriodFields
              key={key}
              periodKey={key}
              value={value.periods[key]}
              disabled={disabled}
              onChange={(period) =>
                onChange({ ...value, periods: { ...value.periods, [key]: period } })
              }
            />
          ))}
          <AlternativesField
            value={value.alternatives}
            substances={substances}
            selfId={selfId}
            disabled={disabled}
            onChange={(alternatives) => onChange({ ...value, alternatives })}
          />
          <ConflictFields
            value={value.conflict}
            sources={sources}
            disabled={disabled}
            onChange={(conflict) => onChange({ ...value, conflict })}
          />
        </>
      ) : null}
    </div>
  );
}

/** The lactation block. */
function LactationFields({
  value,
  onChange,
  substances,
  selfId,
  sources,
  disabled,
}: {
  value: LactationBlock | null;
  onChange: (value: LactationBlock | null) => void;
  substances: Substance[];
  selfId: string;
  sources: ClinicalSource[];
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="dt-stack gap-3">
      <Switch
        checked={value !== null}
        disabled={disabled}
        onChange={(on) => onChange(on ? emptyLactation() : null)}
        label={t('admin.pregnancy.blockFilled')}
      />
      {value ? (
        <div className="dt-card dt-stack gap-3 p-4">
          <EvidenceFields
            value={value.evidence}
            disabled={disabled}
            onChange={(evidence) => onChange({ ...value, evidence })}
          />
          <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-3">
            <ConductSelect
              value={value.conduct}
              disabled={disabled}
              onChange={(conduct) => onChange({ ...value, conduct })}
            />
            <LocalizedField
              label={t('admin.pregnancy.lactationConduct')}
              help={t('admin.pregnancy.lactationConductHelp')}
              disabled={disabled}
              value={value.conductText}
              onChange={(conductText) => onChange({ ...value, conductText })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('admin.pregnancy.rid')} help={t('admin.pregnancy.ridHelp')}>
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  mono
                  maxLength={40}
                  disabled={disabled}
                  value={value.relativeInfantDose ?? ''}
                  onChange={(event) =>
                    onChange({ ...value, relativeInfantDose: event.target.value })
                  }
                />
              )}
            </Field>
            <Field label={t('admin.pregnancy.halfLife')} help={t('admin.pregnancy.halfLifeHelp')}>
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  mono
                  maxLength={40}
                  disabled={disabled}
                  value={value.maternalHalfLife ?? ''}
                  onChange={(event) => onChange({ ...value, maternalHalfLife: event.target.value })}
                />
              )}
            </Field>
          </div>
          <LocalizedField
            label={t('admin.pregnancy.reportedEffects')}
            disabled={disabled}
            value={value.reportedEffects}
            onChange={(reportedEffects) => onChange({ ...value, reportedEffects })}
          />
          <LocalizedField
            label={t('admin.pregnancy.specialPopulations')}
            help={t('admin.pregnancy.specialPopulationsHelp')}
            disabled={disabled}
            value={value.specialPopulations}
            onChange={(specialPopulations) => onChange({ ...value, specialPopulations })}
          />
          <LocalizedField
            label={t('admin.pregnancy.considerations')}
            disabled={disabled}
            rows={3}
            value={value.considerations}
            onChange={(considerations) => onChange({ ...value, considerations })}
          />
          <AlternativesField
            value={value.alternatives}
            substances={substances}
            selfId={selfId}
            disabled={disabled}
            onChange={(alternatives) => onChange({ ...value, alternatives })}
          />
          <ConflictFields
            value={value.conflict}
            sources={sources}
            disabled={disabled}
            onChange={(conflict) => onChange({ ...value, conflict })}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Profile editor (ScreenDrugEditorAdmin pattern): tabs mirror what doctors read, structured
 * fields, « Prévisualiser comme médecin ». Saving keeps a draft; publishing never happens here.
 */
export function ProfileEditor({
  version,
  substances,
  registry,
  editable,
  onSaved,
  onAddSource,
}: {
  version: ProfileVersion;
  substances: Substance[];
  registry: ClinicalSource[];
  editable: boolean;
  onSaved: (saved: ProfileVersion) => void;
  onAddSource: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [content, setContent] = useState<ProfileContent>(version.content);
  const [sourceIds, setSourceIds] = useState<string[]>(version.sources.map((source) => source.id));
  const [dirty, setDirty] = useState(false);
  // The registry sources ticked for this version.
  const selected = useMemo(
    () => registry.filter((source) => sourceIds.includes(source.id)),
    [registry, sourceIds],
  );

  // Records an edit (the draft is now unsaved).
  const update = (next: ProfileContent) => {
    setContent(next);
    setDirty(true);
  };

  // Saves the draft: content without empty parts, and the sources ticked.
  const save = useMutation({
    mutationFn: () =>
      call(
        api.PUT('/admin/v1/pregnancy/versions/{versionId}', {
          params: { path: { versionId: version.id } },
          body: { content: cleanContent(content), sourceIds },
        }),
      ),
    onSuccess: (saved) => {
      setDirty(false);
      onSaved(saved);
      toast(t('admin.pregnancy.saved'));
    },
  });

  // A substance's name in the UI language.
  const nameOf = (id: string) => {
    const found = substances.find((item) => item.id === id);
    return found ? (locale === 'en' && found.nameEn ? found.nameEn : found.nameFr) : id;
  };

  return (
    <div className="dt-stack gap-3">
      {editable ? (
        <div className="dt-row-flex justify-between">
          <span className="dt-cap">
            {dirty ? t('admin.pregnancy.unsaved') : t('admin.pregnancy.upToDate')}
          </span>
          {/* « Enregistrer le brouillon ». */}
          <Button
            variant="primary"
            busy={save.isPending}
            disabled={!dirty}
            onClick={() => save.mutate()}
          >
            <Save size={16} aria-hidden />
            {t('admin.pregnancy.saveDraft')}
          </Button>
        </div>
      ) : null}
      {save.isError ? <Alert tone="critical">{errorText(save.error)}</Alert> : null}
      <Tabs defaultValue={editable ? 'pregnancy' : 'preview'} className="dt-stack">
        <TabList label={t('admin.pregnancy.editor')}>
          <Tab value="pregnancy">{t('admin.pregnancy.sectionPregnancy')}</Tab>
          <Tab value="lactation">{t('admin.pregnancy.sectionLactation')}</Tab>
          <Tab value="sources">{t('admin.pregnancy.tabSources', { count: sourceIds.length })}</Tab>
          <Tab value="preview">{t('admin.pregnancy.preview')}</Tab>
        </TabList>
        <TabPanel value="pregnancy">
          <PregnancyFields
            value={content.pregnancy}
            substances={substances}
            selfId={version.substance.id}
            sources={selected}
            disabled={!editable}
            onChange={(pregnancy) => update({ ...content, pregnancy })}
          />
        </TabPanel>
        <TabPanel value="lactation">
          <LactationFields
            value={content.lactation}
            substances={substances}
            selfId={version.substance.id}
            sources={selected}
            disabled={!editable}
            onChange={(lactation) => update({ ...content, lactation })}
          />
        </TabPanel>
        <TabPanel value="sources">
          <fieldset className="dt-card dt-stack gap-2 p-4">
            <legend className="dt-heading">{t('admin.pregnancy.versionSources')}</legend>
            <p className="dt-cap">{t('admin.pregnancy.versionSourcesHelp')}</p>
            {registry.length === 0 ? (
              <p className="dt-cap">{t('admin.pregnancy.noSources')}</p>
            ) : null}
            {registry.map((source) => (
              <Switch
                key={source.id}
                checked={sourceIds.includes(source.id)}
                disabled={!editable}
                onChange={(on) => {
                  setSourceIds((current) =>
                    on ? [...current, source.id] : current.filter((id) => id !== source.id),
                  );
                  setDirty(true);
                }}
                label={
                  <span>
                    {sourceCitation(source)}
                    {source.publisher ? (
                      <span className="dt-cap"> · {source.publisher}</span>
                    ) : null}
                  </span>
                }
              />
            ))}
            {editable ? (
              <div>
                {/* « Ajouter une source » to the registry, without leaving the editor. */}
                <Button size="sm" onClick={onAddSource}>
                  <Plus size={14} aria-hidden />
                  {t('admin.pregnancy.addSource')}
                </Button>
              </div>
            ) : null}
          </fieldset>
        </TabPanel>
        <TabPanel value="preview">
          <ProfileView
            content={cleanContent(content)}
            sources={selected}
            nameOf={nameOf}
            reviewer={version.reviewedBy?.fullName ?? null}
            version={version.version}
          />
        </TabPanel>
      </Tabs>
    </div>
  );
}
