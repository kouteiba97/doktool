'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { Skeleton } from '@/ui/feedback';
import { TextInput } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';

/** What the synonyms belong to. */
type EntityType = Schemas['SearchEntityType'];

export const MAX_SYNONYMS = 30;
export const MAX_SYNONYM_LENGTH = 80;

/** Adds a term unless it is blank, too long, a case-insensitive duplicate, or over the limit. */
export function addTerm(terms: readonly string[], raw: string): string[] {
  const term = raw.trim().replace(/\s+/g, ' ');
  if (!term || term.length > MAX_SYNONYM_LENGTH || terms.length >= MAX_SYNONYMS) return [...terms];
  const lower = term.toLocaleLowerCase();
  if (terms.some((existing) => existing.toLocaleLowerCase() === lower)) return [...terms];
  return [...terms, term];
}

/**
 * Search synonyms of one model or calculator (section 12): lay terms, abbreviations, frequent
 * misspellings, FR and EN. Saving replaces the whole list and asks for a reason.
 */
export function SynonymsEditor({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: string;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has } = useGrants();
  const canEdit = has(entityType === 'CALCULATOR' ? 'calculators.draft' : 'library.write');
  const key = ['admin', 'synonyms', entityType, entityId] as const;
  // The synonyms saved now.
  const saved = useQuery({
    queryKey: key,
    queryFn: () =>
      call(
        api.GET('/admin/v1/search/synonyms/{entityId}', {
          params: { path: { entityId }, query: { entityType } },
        }),
      ),
  });
  // Unsaved edits; null shows the saved list.
  const [edited, setEdited] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const terms = edited ?? saved.data?.terms ?? [];

  // Replaces the synonyms (with a reason).
  const save = useMutation({
    mutationFn: (reason: string) =>
      call(
        api.PUT('/admin/v1/search/synonyms/{entityId}', {
          params: { path: { entityId }, query: { entityType } },
          body: { terms, reason },
        }),
      ),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      setEdited(null);
      toast(t('admin.synonyms.saved'));
    },
  });

  if (saved.isPending) return <Skeleton lines={2} />;
  if (saved.isError) return <p className="dt-help error">{errorText(saved.error)}</p>;

  const changed = edited !== null && JSON.stringify(edited) !== JSON.stringify(saved.data.terms);
  // Adds the typed word to the list (not saved yet).
  const add = () => {
    setEdited(addTerm(terms, draft));
    setDraft('');
  };

  return (
    <div className="dt-stack">
      <p className="dt-cap">{t('admin.synonyms.help', { max: MAX_SYNONYMS })}</p>
      {terms.length === 0 ? <p className="dt-cap">{t('admin.synonyms.none')}</p> : null}
      <ul className="dt-row-flex" aria-label={t('admin.synonyms.title')}>
        {terms.map((term) => (
          <li key={term} className="dt-chip">
            {term}
            {canEdit ? (
              // Removes this synonym from the list (not saved yet).
              <button
                type="button"
                aria-label={t('admin.synonyms.remove', { term })}
                onClick={() => setEdited(terms.filter((item) => item !== term))}
              >
                <X size={12} aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <>
          <div className="flex gap-2">
            <TextInput
              aria-label={t('admin.synonyms.add')}
              placeholder={t('admin.synonyms.placeholder')}
              value={draft}
              maxLength={MAX_SYNONYM_LENGTH}
              disabled={terms.length >= MAX_SYNONYMS}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  add();
                }
              }}
            />
            {/* « Ajouter » the typed synonym. */}
            <Button onClick={add} disabled={!draft.trim() || terms.length >= MAX_SYNONYMS}>
              {t('admin.synonyms.add')}
            </Button>
          </div>
          <div className="flex gap-2">
            {/* « Enregistrer »: asks for a reason, then saves the list. */}
            <Button
              variant="primary"
              size="sm"
              disabled={!changed}
              onClick={() => setConfirming(true)}
            >
              {t('admin.synonyms.save')}
            </Button>
            {changed ? (
              // « Annuler »: back to the saved list.
              <Button size="sm" variant="ghost" onClick={() => setEdited(null)}>
                {t('admin.common.undo')}
              </Button>
            ) : null}
          </div>
          <ReasonDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t('admin.synonyms.saveTitle')}
            confirmLabel={t('admin.synonyms.save')}
            onConfirm={(reason) => save.mutateAsync(reason)}
          />
        </>
      ) : null}
    </div>
  );
}
