'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { useState } from 'react';
import { api, call } from '@/api/client';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useErrorText } from '@/ui/errors';
import { Alert } from '@/ui/feedback';
import { Field, TextArea } from '@/ui/field';
import { ReasonDialog, reasonSchema } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { approvalStep, SignOffRows } from '../clinical-review/sign-offs';
import { currentRun, readDefinition } from './definition';
import { type Calculator, publicationGates, type Version } from './labels';

/** Which dialog is open. */
type Action = 'return' | 'publish' | 'retire' | 'discard' | null;

/**
 * « Revue »: author, reviewer and note; the publication gate; and the lifecycle actions
 * (submit, return, approve and publish, retire, discard). Author ≠ reviewer (section 28).
 */
export function ReviewPanel({
  calculator,
  version,
  onChanged,
}: {
  calculator: Calculator;
  version: Version;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const { has, me } = useGrants();
  const [action, setAction] = useState<Action>(null);
  const run = currentRun(version.testRun, version.definitionSha256);
  const gates = publicationGates(version, readDefinition(version.definition), run, me?.id);
  const authorGatesOk = gates
    .filter((gate) => gate.label !== 'admin.calculators.gateReviewer')
    .every((gate) => gate.ok);
  const iAmAuthor = me?.id === version.authoredBy.id;
  const step = approvalStep(version, me?.id, 'admin.calculators.publish');

  // « Soumettre à revue »: the API checks the gate again.
  const submit = useMutation({
    mutationFn: () =>
      call(
        api.POST('/admin/v1/calculators/versions/{versionId}/submit', {
          params: { path: { versionId: version.id } },
        }),
      ),
    onSuccess: async () => {
      await onChanged();
      toast(t('admin.calculators.submitted'));
    },
    onError: (error) => toast(errorText(error), 'error'),
  });

  const path = { params: { path: { versionId: version.id } } };
  // After an action: reload the calculator and confirm with a toast.
  const done = async (message: string) => {
    await onChanged();
    toast(message);
  };

  return (
    <div className="dt-stack gap-4">
      <dl className="dt-dl">
        <dt>{t('admin.calculators.author')}</dt>
        <dd>
          {version.authoredBy.fullName} · {formatDateTime(locale, version.createdAt)}
        </dd>
        <dt>{t('admin.calculators.reviewer')}</dt>
        <dd>
          {version.reviewedBy
            ? `${version.reviewedBy.fullName}${version.reviewedAt ? ` · ${formatDateTime(locale, version.reviewedAt)}` : ''}`
            : '—'}
        </dd>
        <SignOffRows version={version} />
        <dt>{t('admin.calculators.reviewNote')}</dt>
        <dd>{version.reviewNote ?? '—'}</dd>
        <dt>{t('admin.calculators.publishedAt')}</dt>
        <dd>{version.publishedAt ? formatDateTime(locale, version.publishedAt) : '—'}</dd>
        <dt>{t('admin.calculators.engineVersion')}</dt>
        <dd className="dt-mono">{version.engineVersion ?? '—'}</dd>
      </dl>

      {version.status === 'DRAFT' || version.status === 'IN_REVIEW' ? (
        <section className="dt-stack">
          <h3 className="dt-heading">{t('admin.calculators.gateTitle')}</h3>
          <ul className="dt-stack gap-1">
            {gates.map((gate) => (
              <li key={gate.label} className="dt-row-flex">
                <Badge tone={gate.ok ? 'success' : 'neutral'}>
                  {gate.ok ? <Check aria-hidden /> : <Minus aria-hidden />}
                  {gate.ok ? t('admin.calculators.gateMet') : t('admin.calculators.gatePending')}
                </Badge>
                {t(gate.label)}
              </li>
            ))}
          </ul>
          <p className="dt-cap">{t('admin.calculators.gateServerNote')}</p>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {version.status === 'DRAFT' && has('calculators.draft') ? (
          <>
            {/* « Soumettre à revue »: possible once sources and passing tests are there. */}
            <Button
              variant="primary"
              busy={submit.isPending}
              disabled={!authorGatesOk}
              onClick={() => submit.mutate()}
            >
              {t('admin.calculators.submit')}
            </Button>
            {/* « Supprimer le brouillon ». */}
            <Button variant="danger" onClick={() => setAction('discard')}>
              {t('admin.calculators.discard')}
            </Button>
          </>
        ) : null}
        {version.status === 'IN_REVIEW' && has('calculators.review') ? (
          <>
            {has('calculators.publish') ? (
              // « Approuver et publier » (or first / second sign-off): never by the author, never
              // twice by the same reviewer.
              <Button
                variant="primary"
                disabled={iAmAuthor || step.signedByMe || !authorGatesOk}
                onClick={() => setAction('publish')}
              >
                {t(step.label)}
              </Button>
            ) : null}
            {/* « Renvoyer à l'auteur »: back to draft, with a reason. */}
            <Button disabled={iAmAuthor} onClick={() => setAction('return')}>
              {t('admin.calculators.return')}
            </Button>
          </>
        ) : null}
        {version.status === 'PUBLISHED' && has('calculators.retire') ? (
          // « Retirer »: the published version leaves the app at the next sync.
          <Button variant="danger" onClick={() => setAction('retire')}>
            {t('admin.calculators.retire')}
          </Button>
        ) : null}
      </div>
      {version.status === 'IN_REVIEW' && iAmAuthor ? (
        <Alert tone="info">{t('admin.calculators.authorCannotReview')}</Alert>
      ) : null}
      {version.status === 'IN_REVIEW' && step.signedByMe ? (
        <Alert tone="info">{t('admin.review.waitingSecond')}</Alert>
      ) : null}

      <ReasonDialog
        open={action === 'return'}
        onOpenChange={(open) => setAction(open ? 'return' : null)}
        title={t('admin.calculators.returnTitle')}
        description={t('admin.calculators.returnBody')}
        confirmLabel={t('admin.calculators.return')}
        onConfirm={async (reason) => {
          await call(
            api.POST('/admin/v1/calculators/versions/{versionId}/return', {
              ...path,
              body: { reason },
            }),
          );
          await done(t('admin.calculators.returned'));
        }}
      />
      <ReasonDialog
        open={action === 'retire'}
        onOpenChange={(open) => setAction(open ? 'retire' : null)}
        title={t('admin.calculators.retireTitle')}
        description={t('admin.calculators.retireBody', {
          name: locale === 'en' ? calculator.nameEn : calculator.nameFr,
        })}
        confirmLabel={t('admin.calculators.retire')}
        confirmVariant="danger"
        onConfirm={async (reason) => {
          await call(
            api.POST('/admin/v1/calculators/versions/{versionId}/retire', {
              ...path,
              body: { reason },
            }),
          );
          await done(t('admin.calculators.retired'));
        }}
      />
      <PublishDialog
        open={action === 'publish'}
        onOpenChange={(open) => setAction(open ? 'publish' : null)}
        title={t(step.title ?? 'admin.calculators.publishTitle')}
        description={t(step.body ?? 'admin.calculators.publishBody')}
        confirmLabel={t(step.label)}
        onConfirm={async (reviewNote) => {
          const result = await call(
            api.POST('/admin/v1/calculators/versions/{versionId}/publish', {
              ...path,
              body: { reviewNote },
            }),
          );
          await done(
            result.status === 'PUBLISHED'
              ? t('admin.calculators.published')
              : t('admin.review.signedOff'),
          );
        }}
      />
      <DiscardDialog
        open={action === 'discard'}
        onOpenChange={(open) => setAction(open ? 'discard' : null)}
        onConfirm={async () => {
          await call(api.DELETE('/admin/v1/calculators/versions/{versionId}', path));
          await done(t('admin.calculators.discarded'));
        }}
      />
    </div>
  );
}

/**
 * « Approuver et publier », or a first of two sign-offs (ADR-024): the review note is the
 * reviewer's written decision.
 */
function PublishDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (note: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Sends the reviewer's note with the approval.
  const publish = useMutation({
    mutationFn: () => onConfirm(note.trim()),
    onSuccess: () => onOpenChange(false),
    onError: (failure) => setError(errorText(failure)),
  });
  const valid = reasonSchema.safeParse(note).success;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (publish.isPending) return;
        if (next) {
          setNote('');
          setError(null);
        }
        onOpenChange(next);
      }}
      title={title}
      description={description}
      onSubmit={() => publish.mutate()}
      footer={
        <>
          {/* « Annuler ». */}
          <Button onClick={() => onOpenChange(false)} disabled={publish.isPending}>
            {t('admin.common.cancel')}
          </Button>
          {/* Confirms the approval (needs a written note). */}
          <Button type="submit" variant="primary" busy={publish.isPending} disabled={!valid}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field
        label={t('admin.calculators.reviewNote')}
        required
        help={t('admin.calculators.reviewNoteHelp')}
      >
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            rows={4}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      {error ? <Alert tone="critical">{error}</Alert> : null}
    </Dialog>
  );
}

/** Confirms deleting a draft. */
function DiscardDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const discard = useMutation({
    mutationFn: onConfirm,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (discard.isPending ? undefined : onOpenChange(next))}
      title={t('admin.calculators.discardTitle')}
      description={t('admin.calculators.discardBody')}
      footer={
        <>
          {/* « Annuler ». */}
          <Button onClick={() => onOpenChange(false)} disabled={discard.isPending}>
            {t('admin.common.cancel')}
          </Button>
          {/* « Supprimer »: deletes the draft with its sources and tests. */}
          <Button variant="danger" busy={discard.isPending} onClick={() => discard.mutate()}>
            {t('admin.calculators.discard')}
          </Button>
        </>
      }
    >
      {discard.isError ? <Alert tone="critical">{errorText(discard.error)}</Alert> : null}
    </Dialog>
  );
}
