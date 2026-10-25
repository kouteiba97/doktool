'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, call } from '@/api/client';
import type { MessageKey } from '@/i18n/messages';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, Select, Switch, TextArea, TextInput } from '@/ui/field';
import type { Substance } from './labels';

/** Catalogue key of each reason a merge is refused. */
const BLOCKER_LABELS: Record<string, MessageKey> = {
  SAME_SUBSTANCE: 'admin.pregnancyMerge.blocker.same',
  SOURCE_ALREADY_MERGED: 'admin.pregnancyMerge.blocker.sourceMerged',
  TARGET_MERGED: 'admin.pregnancyMerge.blocker.targetMerged',
  TARGET_ARCHIVED: 'admin.pregnancyMerge.blocker.targetArchived',
  SOURCE_HAS_MERGED: 'admin.pregnancyMerge.blocker.sourceHasMerged',
  SOURCE_OPEN_VERSION: 'admin.pregnancyMerge.blocker.openVersion',
  TOO_MANY_SYNONYMS: 'admin.pregnancyMerge.blocker.tooManySynonyms',
};

/**
 * « Fusionner avec… » (ADR-027): the duplicate's names join the substance kept; its profile is never
 * copied. The reviewer sees exactly what changes before confirming, with a reason for the audit log.
 */
export function MergeDialog({
  substance,
  substances,
  open,
  onOpenChange,
  onMerged,
}: {
  substance: { id: string; nameFr: string };
  substances: Substance[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [filter, setFilter] = useState('');
  const [into, setInto] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState('');
  // Substances the duplicate can be merged into (others, visible, not merged), filtered by the
  // words typed.
  const candidates = useMemo(() => {
    const words = filter.trim().toLocaleLowerCase('fr').split(/\s+/).filter(Boolean);
    return substances
      .filter((s) => s.id !== substance.id && s.enabled && !s.mergedInto)
      .filter((s) =>
        words.every((word) =>
          [s.nameFr, s.nameEn ?? '', ...s.synonyms].some((name) =>
            name.toLocaleLowerCase('fr').includes(word),
          ),
        ),
      )
      .slice(0, 50);
  }, [filter, substances, substance.id]);
  // What the merge would change, and what blocks it.
  const preview = useQuery({
    queryKey: ['admin', 'pregnancy', 'merge-preview', substance.id, into],
    enabled: open && into !== '',
    queryFn: () =>
      call(
        api.GET('/admin/v1/pregnancy/substances/{id}/merge-preview', {
          params: { path: { id: substance.id }, query: { into } },
        }),
      ),
  });
  // Performs the merge.
  const merge = useMutation({
    mutationFn: () =>
      call(
        api.POST('/admin/v1/pregnancy/substances/{id}/merge', {
          params: { path: { id: substance.id } },
          body: { into, reason: reason.trim(), acknowledgeHiddenProfile: acknowledged },
        }),
      ),
    onSuccess: () => {
      onOpenChange(false);
      onMerged();
    },
  });
  const data = preview.data;
  // The merge can be confirmed: nothing blocks it, a hidden published profile is acknowledged, and
  // a reason is given.
  const ready =
    data !== undefined &&
    data.blockers.length === 0 &&
    (data.sourcePublishedVersion === null || acknowledged) &&
    reason.trim().length >= 3;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t('admin.pregnancyMerge.title', { name: substance.nameFr })}
      description={t('admin.pregnancyMerge.help')}
      onSubmit={() => (ready ? merge.mutate() : undefined)}
      footer={
        <>
          {/* « Annuler ». */}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          {/* « Fusionner ». */}
          <Button variant="danger" type="submit" disabled={!ready || merge.isPending}>
            {t('admin.pregnancyMerge.confirm')}
          </Button>
        </>
      }
    >
      <div className="dt-stack gap-3">
        <Field label={t('admin.pregnancyMerge.target')} required>
          {({ inputId }) => (
            <div className="dt-stack gap-2">
              <TextInput
                aria-label={t('admin.pregnancyMerge.search')}
                placeholder={t('admin.pregnancyMerge.search')}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <Select
                id={inputId}
                value={into}
                onChange={(event) => {
                  setInto(event.target.value);
                  setAcknowledged(false);
                }}
              >
                <option value="">{t('admin.pregnancyMerge.choose')}</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.nameFr}
                    {candidate.synonyms.length ? ` (${candidate.synonyms.join(', ')})` : ''}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </Field>

        {preview.isError ? <Alert tone="critical">{errorText(preview.error)}</Alert> : null}
        {data ? (
          <>
            {data.blockers.length > 0 ? (
              <Alert tone="critical" title={t('admin.pregnancyMerge.blocked')}>
                <ul className="list-disc ps-5">
                  {data.blockers.map((code) => (
                    <li key={code}>
                      {t(BLOCKER_LABELS[code] ?? 'admin.pregnancyMerge.blocker.unknown')}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <Alert tone="info" title={t('admin.pregnancyMerge.whatChanges')}>
                <ul className="list-disc ps-5">
                  <li>
                    {data.namesToAdd.length > 0
                      ? t('admin.pregnancyMerge.namesAdded', {
                          names: data.namesToAdd.join(' · '),
                          target: data.target.nameFr,
                        })
                      : t('admin.pregnancyMerge.noNames')}
                  </li>
                  <li>{t('admin.pregnancyMerge.archived', { name: data.source.nameFr })}</li>
                  <li>{t('admin.pregnancyMerge.links', { target: data.target.nameFr })}</li>
                  <li>{t('admin.pregnancyMerge.history')}</li>
                </ul>
              </Alert>
            )}
            {data.blockers.length === 0 && data.sourcePublishedVersion !== null ? (
              <Alert tone="warning">
                <Switch
                  checked={acknowledged}
                  onChange={setAcknowledged}
                  label={t('admin.pregnancyMerge.acknowledge', {
                    version: data.sourcePublishedVersion,
                    target: data.target.nameFr,
                  })}
                />
              </Alert>
            ) : null}
          </>
        ) : null}

        <Field
          label={t('admin.pregnancyMerge.reason')}
          required
          help={t('admin.pregnancyMerge.reasonHelp')}
        >
          {({ inputId }) => (
            <TextArea
              id={inputId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        {merge.isError ? <Alert tone="critical">{errorText(merge.error)}</Alert> : null}
      </div>
    </Dialog>
  );
}
