'use client';

import { Ban, CircleOff, Clock3, Info, SearchX } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/i18n/i18n-provider';
import { Alert } from '@/ui/feedback';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import {
  type ClinicalSource,
  type Conduct,
  CONDUCT_LABELS,
  EVIDENCE_LABELS,
  type LactationBlock,
  localized,
  type Localized,
  PERIOD_LABELS,
  PERIODS,
  type PeriodKey,
  type PregnancyBlock,
  type ProfileContent,
  sourceCitation,
} from './labels';

const CONDUCT_ICONS: Record<Conduct, typeof Ban> = {
  CONTRAINDICATED: Ban,
  AVOID: CircleOff,
  OCCASIONAL_USE: Clock3,
};

/** The conduct badge: an instruction, as icon + word (ScreenPregnancyDesktop). */
export function ConductBadge({ conduct }: { conduct: Conduct }) {
  const { t } = useI18n();
  const Icon = CONDUCT_ICONS[conduct];
  return (
    <span className={`dt-badge ${conduct === 'OCCASIONAL_USE' ? 'warning' : 'critical'}`}>
      <Icon size={12} aria-hidden />
      {t(CONDUCT_LABELS[conduct])}
    </span>
  );
}

/** Four neutral segments, the level word and the population note — never a colour verdict. */
export function EvidenceMeter({ level, population }: { level: number; population?: Localized }) {
  const { t, locale } = useI18n();
  const word = t(EVIDENCE_LABELS[level]!);
  return (
    <div className="dt-row-flex">
      <div
        className="dt-meter"
        role="img"
        aria-label={t('admin.pregnancy.meterLabel', { word, level })}
      >
        {[1, 2, 3, 4].map((segment) => (
          <i key={segment} className={segment <= level ? 'on' : undefined} />
        ))}
      </div>
      <b className="text-label">{word}</b>
      {population ? <span className="dt-cap">{localized(population, locale)}</span> : null}
    </div>
  );
}

function Labelled({ label, text }: { label: string; text: Localized | undefined }) {
  const { locale } = useI18n();
  if (!text) return null;
  return (
    <div>
      <div className="dt-label">{label}</div>
      <p className="mt-1">{localized(text, locale)}</p>
    </div>
  );
}

/** « Absence de données — ce n'est pas une preuve d'innocuité »: a full block, never empty. */
function NoData({ alternatives }: { alternatives: string[] }) {
  const { t } = useI18n();
  return (
    <div className="dt-card gap-2 p-4">
      <span className="dt-row-flex">
        <SearchX size={16} aria-hidden />
        <b>{t('admin.pregnancy.noDataTitle')}</b>
      </span>
      <p className="dt-cap">{t('admin.pregnancy.noDataBody')}</p>
      <Alternatives names={alternatives} />
    </div>
  );
}

function Alternatives({ names }: { names: string[] }) {
  const { t } = useI18n();
  if (names.length === 0) return null;
  return (
    <div>
      <div className="dt-label">{t('admin.pregnancy.alternatives')}</div>
      <div className="dt-row-flex mt-1">
        {names.map((name) => (
          <span key={name} className="dt-chip">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function Conflict({
  conflict,
  sources,
}: {
  conflict: PregnancyBlock['conflict'];
  sources: ClinicalSource[];
}) {
  const { t, locale } = useI18n();
  if (!conflict) return null;
  const [first, second] = conflict.sourceIds.map(
    (id) => sources.find((source) => source.id === id)?.title ?? '—',
  );
  return (
    <Alert
      tone="info"
      title={t('admin.pregnancy.conflictTitle', { first: first!, second: second! })}
    >
      {localized(conflict.synthesis, locale)}
    </Alert>
  );
}

/** Sources (title · edition), reviewer and date, version — the mandatory evidence footer. */
export function EvidenceFooter({
  sources,
  reviewer,
  version,
}: {
  sources: ClinicalSource[];
  reviewer: string | null;
  version: number;
}) {
  const { t } = useI18n();
  return (
    <div className="dt-evidence">
      <span>
        {t('admin.pregnancy.footerSources')} {sources.map(sourceCitation).join(' · ') || '—'}
      </span>
      <span>
        {reviewer
          ? t('admin.pregnancy.footerReviewed', { name: reviewer })
          : t('admin.pregnancy.footerNotReviewed')}
      </span>
      <span className="dt-mono">v{version}</span>
    </div>
  );
}

function PregnancyView({
  block,
  alternatives,
  sources,
}: {
  block: PregnancyBlock;
  alternatives: string[];
  sources: ClinicalSource[];
}) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<PeriodKey>('T1');
  return (
    <div className="dt-stack gap-3">
      <Conflict conflict={block.conflict} sources={sources} />
      <Tabs
        value={period}
        onValueChange={(next) => setPeriod(next as PeriodKey)}
        className="dt-stack"
      >
        <TabList label={t('admin.pregnancy.periods')}>
          {PERIODS.map((key) => {
            const value = block.periods[key];
            return (
              <Tab key={key} value={key}>
                <span className="dt-row-flex">
                  {t(PERIOD_LABELS[key])}
                  {value?.conduct ? <ConductBadge conduct={value.conduct} /> : null}
                </span>
              </Tab>
            );
          })}
        </TabList>
        {PERIODS.map((key) => {
          const value = block.periods[key];
          return (
            <TabPanel key={key} value={key}>
              {!value ? (
                <p className="dt-cap">{t('admin.pregnancy.periodMissing')}</p>
              ) : value.evidence.level === 0 ? (
                <NoData alternatives={alternatives} />
              ) : (
                <div className="dt-stack gap-3">
                  {value.conductDetail ? (
                    <Alert tone={value.conduct === 'OCCASIONAL_USE' ? 'warning' : 'critical'}>
                      <Labelled label={t('admin.pregnancy.conduct')} text={value.conductDetail} />
                    </Alert>
                  ) : null}
                  <Labelled label={t('admin.pregnancy.riskContext')} text={value.riskContext} />
                  <div>
                    <div className="dt-label">{t('admin.pregnancy.evidence')}</div>
                    <EvidenceMeter
                      level={value.evidence.level}
                      population={value.evidence.population}
                    />
                  </div>
                  <Labelled
                    label={t('admin.pregnancy.considerations')}
                    text={value.considerations}
                  />
                  <Alternatives names={alternatives} />
                </div>
              )}
            </TabPanel>
          );
        })}
      </Tabs>
      <section aria-label={t('admin.pregnancy.byPeriod')} className="dt-stack gap-1">
        <h4 className="dt-label">{t('admin.pregnancy.byPeriod')}</h4>
        {PERIODS.map((key) => {
          const value = block.periods[key];
          return (
            <div key={key} className="dt-row-flex justify-between">
              <span>{t(PERIOD_LABELS[key])}</span>
              <span className="dt-row-flex">
                <span className="dt-cap">
                  {value ? t(EVIDENCE_LABELS[value.evidence.level]!) : '—'}
                </span>
                {value?.conduct ? <ConductBadge conduct={value.conduct} /> : null}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function LactationView({
  block,
  alternatives,
  sources,
}: {
  block: LactationBlock;
  alternatives: string[];
  sources: ClinicalSource[];
}) {
  const { t } = useI18n();
  if (block.evidence.level === 0) return <NoData alternatives={alternatives} />;
  return (
    <div className="dt-stack gap-3">
      <Conflict conflict={block.conflict} sources={sources} />
      <div className="dt-stack gap-1">
        <span className="dt-row-flex">
          <span className="dt-label">{t('admin.pregnancy.conduct')}</span>
          {block.conduct ? <ConductBadge conduct={block.conduct} /> : null}
        </span>
        <Labelled label="" text={block.conductText} />
      </div>
      {block.relativeInfantDose || block.maternalHalfLife || block.reportedEffects ? (
        <div>
          <div className="dt-label">{t('admin.pregnancy.infantExposure')}</div>
          <dl className="dt-dl mt-1">
            {block.relativeInfantDose ? (
              <>
                <dt>{t('admin.pregnancy.rid')}</dt>
                <dd className="dt-mono">{block.relativeInfantDose}</dd>
              </>
            ) : null}
            {block.maternalHalfLife ? (
              <>
                <dt>{t('admin.pregnancy.halfLife')}</dt>
                <dd className="dt-mono">{block.maternalHalfLife}</dd>
              </>
            ) : null}
          </dl>
          <Labelled label={t('admin.pregnancy.reportedEffects')} text={block.reportedEffects} />
        </div>
      ) : null}
      <Labelled label={t('admin.pregnancy.specialPopulations')} text={block.specialPopulations} />
      <div>
        <div className="dt-label">{t('admin.pregnancy.evidence')}</div>
        <EvidenceMeter level={block.evidence.level} population={block.evidence.population} />
      </div>
      <Labelled label={t('admin.pregnancy.considerations')} text={block.considerations} />
      <Alternatives names={alternatives} />
    </div>
  );
}

/**
 * A profile as doctors read it (ScreenPregnancyDesktop, ScreenLactationMobile, EvidenceBlock):
 * « Prévisualiser comme médecin » and the review screen.
 */
export function ProfileView({
  content,
  sources,
  nameOf,
  reviewer,
  version,
}: {
  content: ProfileContent;
  sources: ClinicalSource[];
  /** Substance names for alternative ids. */
  nameOf: (id: string) => string;
  reviewer: string | null;
  version: number;
}) {
  const { t } = useI18n();
  const names = (ids: string[]) => ids.map(nameOf);
  return (
    <Tabs defaultValue="pregnancy" className="dt-stack">
      <TabList label={t('admin.pregnancy.preview')}>
        <Tab value="pregnancy">{t('admin.pregnancy.sectionPregnancy')}</Tab>
        <Tab value="lactation">{t('admin.pregnancy.sectionLactation')}</Tab>
      </TabList>
      <TabPanel value="pregnancy">
        <section className="dt-card p-4">
          {content.pregnancy ? (
            <PregnancyView
              block={content.pregnancy}
              alternatives={names(content.pregnancy.alternatives)}
              sources={sources}
            />
          ) : (
            <Alert tone="info" title={t('admin.pregnancy.blockMissing')} />
          )}
          <EvidenceFooter sources={sources} reviewer={reviewer} version={version} />
        </section>
      </TabPanel>
      <TabPanel value="lactation">
        <section className="dt-card p-4">
          {content.lactation ? (
            <LactationView
              block={content.lactation}
              alternatives={names(content.lactation.alternatives)}
              sources={sources}
            />
          ) : (
            <Alert tone="info" title={t('admin.pregnancy.blockMissing')} />
          )}
          <EvidenceFooter sources={sources} reviewer={reviewer} version={version} />
        </section>
      </TabPanel>
    </Tabs>
  );
}

/** Shown to the author when the reviewer sent the version back. */
export function ReviewComment({ comment }: { comment: string }) {
  const { t } = useI18n();
  return (
    <Alert tone="info" title={t('admin.pregnancy.reviewerComment')}>
      <span className="dt-row-flex">
        <Info size={14} aria-hidden />
        {comment}
      </span>
    </Alert>
  );
}
