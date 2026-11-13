'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, Lock } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatBytes, formatDate, formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Drawer } from '@/ui/drawer';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, Skeleton } from '@/ui/feedback';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import { ApproveDialog, RejectDialog, ReleaseDialog } from './decisions';
import {
  DOCUMENT_KIND_LABELS,
  personName,
  PROFESSIONAL_TYPE_LABELS,
  REJECTION_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  STEP_LABELS,
  TYPE_LABELS,
} from './labels';
import { RestrictedViewer } from './restricted-viewer';
import { caseKey, queueKey } from './keys';

/** A case as the review drawer shows it. */
type Case = Schemas['AdminVerificationCaseDto'];

/** Which decision dialog is open. */
type Decision = 'approve' | 'reject' | 'release' | null;

/** Review drawer: Résumé · Documents (restricted) · Historique, and the decisions (section 07). */
export function CaseDrawer({ caseId, onClose }: { caseId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has, me } = useGrants();
  const [decision, setDecision] = useState<Decision>(null);

  const detail = useQuery({
    queryKey: caseKey(caseId ?? ''),
    queryFn: () =>
      call(
        api.GET('/admin/v1/verification/cases/{id}', { params: { path: { id: caseId ?? '' } } }),
      ),
    enabled: caseId !== null,
  });
  const record = detail.data;

  // After a decision: put the new case in the cache, refresh the queue, confirm with a toast.
  const updated = (next: Case, message: string) => {
    queryClient.setQueryData(caseKey(next.id), next);
    void queryClient.invalidateQueries({ queryKey: queueKey });
    toast(message);
  };

  // « Prendre le dossier »: the case becomes IN_REVIEW for this reviewer.
  const claim = useMutation({
    mutationFn: (id: string) =>
      call(api.POST('/admin/v1/verification/cases/{id}/claim', { params: { path: { id } } })),
    onSuccess: (next) => updated(next, t('admin.verification.claimed')),
    onError: (error) => {
      toast(errorText(error), 'error');
      void detail.refetch();
    },
  });

  // Who may act: reviewers; the case must be waiting (claim) or claimed by this admin (decide).
  const canReview = has('verification.review');
  const mine = record?.status === 'IN_REVIEW' && record.reviewer?.id === me?.id;
  const claimable = record?.status === 'SUBMITTED' || record?.status === 'APPEALED';

  const footer =
    record && canReview ? (
      claimable ? (
        <div className="end">
          {/* « Prendre le dossier ». */}
          <Button variant="primary" busy={claim.isPending} onClick={() => claim.mutate(record.id)}>
            {t('admin.verification.claim')}
          </Button>
        </div>
      ) : mine ? (
        <>
          {/* « Libérer »: gives the case back to the queue. */}
          <Button onClick={() => setDecision('release')}>{t('admin.verification.release')}</Button>
          <div className="end">
            {/* « Rejeter »: opens the rejection dialog. */}
            <Button variant="danger" onClick={() => setDecision('reject')}>
              {t('admin.verification.reject')}
            </Button>
            {/* « Approuver »: opens the approval dialog. */}
            <Button variant="primary" onClick={() => setDecision('approve')}>
              <Check size={16} aria-hidden />
              {t('admin.verification.approve')}
            </Button>
          </div>
        </>
      ) : null
    ) : null;

  return (
    <Drawer
      open={caseId !== null}
      onClose={onClose}
      mode={mine ? 'review' : 'inspect'}
      title={
        record
          ? `${personName(record.person)} · ${t(TYPE_LABELS[record.type])}`
          : t('admin.verification.case')
      }
      caption={record ? <span className="dt-mono">{record.id}</span> : null}
      status={
        record ? (
          <Badge tone={STATUS_TONES[record.status]}>{t(STATUS_LABELS[record.status])}</Badge>
        ) : null
      }
      footer={footer}
    >
      {detail.isPending ? (
        <Skeleton lines={8} />
      ) : detail.isError || !record ? (
        <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
          {errorText(detail.error)}
        </EmptyState>
      ) : (
        <>
          {record.status === 'IN_REVIEW' && !mine && record.reviewer ? (
            <Alert tone="info">
              {t('admin.verification.inReviewBy', { name: record.reviewer.fullName })}
            </Alert>
          ) : null}
          <Tabs defaultValue="summary" className="dt-stack">
            <TabList label={t('admin.verification.case')}>
              <Tab value="summary">{t('admin.verification.tabSummary')}</Tab>
              <Tab value="documents">{t('admin.verification.tabDocuments')}</Tab>
              <Tab value="history">{t('admin.verification.tabHistory')}</Tab>
            </TabList>
            <TabPanel value="summary">
              <Summary record={record} />
            </TabPanel>
            <TabPanel value="documents">
              <Documents record={record} mine={mine} />
            </TabPanel>
            <TabPanel value="history">
              <History record={record} />
            </TabPanel>
          </Tabs>
          {/* Mounted per opening, so each decision starts from empty fields. */}
          {decision === 'approve' ? (
            <ApproveDialog
              record={record}
              open
              onOpenChange={(open) => setDecision(open ? 'approve' : null)}
              onDone={(next) => updated(next, t('admin.verification.approved'))}
            />
          ) : null}
          {decision === 'reject' ? (
            <RejectDialog
              record={record}
              open
              onOpenChange={(open) => setDecision(open ? 'reject' : null)}
              onDone={(next) => updated(next, t('admin.verification.rejected'))}
            />
          ) : null}
          {decision === 'release' ? (
            <ReleaseDialog
              record={record}
              open
              onOpenChange={(open) => setDecision(open ? 'release' : null)}
              onDone={(next) => updated(next, t('admin.verification.released'))}
            />
          ) : null}
        </>
      )}
    </Drawer>
  );
}

/** « Résumé » tab: the person, the declared details, the dates and which steps were provided. */
function Summary({ record }: { record: Case }) {
  const { t, locale } = useI18n();
  const details = record.details;
  const profile = record.person.profile;
  const rows: [string, ReactNode][] = [
    [t('admin.verification.fieldEmail'), record.person.email ?? '—'],
    [
      t('admin.verification.fieldPhone'),
      record.person.phone ? <span className="dt-mono">{record.person.phone}</span> : '—',
    ],
    [t('admin.verification.fieldWilaya'), record.person.wilaya ?? '—'],
    [t('admin.verification.fieldAccountCreated'), formatDate(locale, record.person.createdAt)],
  ];
  if (details.professionalType) {
    rows.push([
      t('admin.verification.fieldProfessionalType'),
      t(PROFESSIONAL_TYPE_LABELS[details.professionalType]),
    ]);
  } else if (profile) {
    rows.push([
      t('admin.verification.fieldProfessionalType'),
      t(PROFESSIONAL_TYPE_LABELS[profile.professionalType]),
    ]);
  }
  if (details.documentKind) {
    rows.push([
      t('admin.verification.fieldDocumentKind'),
      t(DOCUMENT_KIND_LABELS[details.documentKind]),
    ]);
  }
  if (details.orderNumber) {
    rows.push([
      t('admin.verification.fieldOrderNumber'),
      <span key="order" className="dt-mono">
        {details.orderNumber}
      </span>,
    ]);
  }
  if (record.references.specialty)
    rows.push([t('admin.verification.fieldSpecialty'), record.references.specialty]);
  if (record.references.institution)
    rows.push([t('admin.verification.fieldInstitution'), record.references.institution]);
  if (details.residencyYear)
    rows.push([t('admin.verification.fieldResidencyYear'), String(details.residencyYear)]);
  if (record.references.university)
    rows.push([t('admin.verification.fieldUniversity'), record.references.university]);
  if (details.academicYear)
    rows.push([t('admin.verification.fieldAcademicYear'), String(details.academicYear)]);
  if (record.submittedAt)
    rows.push([t('admin.verification.fieldSubmitted'), formatDateTime(locale, record.submittedAt)]);
  if (record.appealedAt)
    rows.push([t('admin.verification.fieldAppealed'), formatDateTime(locale, record.appealedAt)]);
  if (record.decidedAt)
    rows.push([t('admin.verification.fieldDecided'), formatDateTime(locale, record.decidedAt)]);
  if (record.expiresAt)
    rows.push([t('admin.verification.fieldExpires'), formatDate(locale, record.expiresAt)]);

  return (
    <div className="dt-stack gap-4">
      {record.rejection ? (
        <Alert
          tone="warning"
          title={t('admin.verification.rejectionTitle', {
            reason: t(REJECTION_LABELS[record.rejection.reasonCode]),
          })}
        >
          {record.rejection.note ?? null}
          {record.rejectedBy ? (
            <div className="dt-cap">
              {t('admin.verification.rejectedBy', { name: record.rejectedBy.fullName })}
            </div>
          ) : null}
        </Alert>
      ) : null}
      <dl className="dt-dl">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="dt-stack gap-2">
        <h3 className="dt-label">{t('admin.verification.steps')}</h3>
        <ul className="dt-stack gap-1">
          {record.steps.map((step) => (
            <li key={step.stepType} className="dt-row-flex">
              {step.provided ? (
                <Badge tone="success">
                  <Check aria-hidden />
                  {t('admin.verification.stepProvided')}
                </Badge>
              ) : (
                <Badge tone={step.required ? 'warning' : 'neutral'}>
                  {step.required
                    ? t('admin.verification.stepMissing')
                    : t('admin.verification.stepOptional')}
                </Badge>
              )}
              {t(STEP_LABELS[step.stepType])}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * « Documents » tab: listed only with the time-limited documents grant; opened only by the
 * reviewer holding the case.
 */
function Documents({ record, mine }: { record: Case; mine: boolean }) {
  const { t, locale } = useI18n();
  const { has } = useGrants();
  const [open, setOpen] = useState<Schemas['AdminVerificationDocumentDto'] | null>(null);

  if (!has('verification.documents.view')) {
    return (
      <div className="dt-restricted">
        <Lock aria-hidden />
        <b>{t('admin.verification.restrictedTitle')}</b>
        <p>{t('admin.verification.restrictedBody')}</p>
        <code className="dt-mono">verification.documents.view</code>
        <p className="dt-cap">{t('admin.verification.restrictedAudit')}</p>
      </div>
    );
  }
  if (record.documents.length === 0) {
    return <p className="dt-cap">{t('admin.verification.noDocuments')}</p>;
  }
  return (
    <div className="dt-stack">
      {!mine ? <Alert tone="info">{t('admin.verification.claimToView')}</Alert> : null}
      <ul className="dt-stack gap-2">
        {record.documents.map((document) => (
          <li key={document.id} className="dt-row-flex justify-between">
            <span className="min-w-0">
              <b>{t(STEP_LABELS[document.stepType])}</b>
              <span className="dt-cap">
                {' · '}
                {formatDateTime(locale, document.uploadedAt)} ·{' '}
                {formatBytes(locale, document.sizeBytes)}
              </span>
            </span>
            {/* « Ouvrir »: shows the document in the restricted viewer (audited). */}
            <Button size="sm" disabled={!mine} onClick={() => setOpen(document)}>
              {t('admin.verification.openDocument')}
            </Button>
          </li>
        ))}
      </ul>
      {open ? (
        <RestrictedViewer
          key={open.id}
          document={open}
          label={t(STEP_LABELS[open.stepType])}
          onClose={() => setOpen(null)}
        />
      ) : null}
      <p className="dt-cap">{t('admin.verification.restrictedAudit')}</p>
    </div>
  );
}

/** « Historique » tab: the person's earlier cases of this type. */
function History({ record }: { record: Case }) {
  const { t, locale } = useI18n();
  if (record.history.length === 0)
    return <p className="dt-cap">{t('admin.verification.noHistory')}</p>;
  return (
    <ul className="dt-stack gap-2">
      {record.history.map((item) => (
        <li key={item.id} className="dt-card gap-1 p-3">
          <div className="dt-row-flex">
            <Badge tone={STATUS_TONES[item.status]}>{t(STATUS_LABELS[item.status])}</Badge>
            <span className="dt-mono dt-cap">{item.id}</span>
          </div>
          <div className="dt-cap">
            {item.submittedAt
              ? t('admin.verification.historySubmitted', {
                  date: formatDate(locale, item.submittedAt),
                })
              : null}
            {item.decidedAt
              ? ` · ${t('admin.verification.historyDecided', { date: formatDate(locale, item.decidedAt) })}`
              : null}
          </div>
          {item.rejectionReasonCode && item.rejectionReasonCode in REJECTION_LABELS ? (
            <div className="dt-cap">
              {t(REJECTION_LABELS[item.rejectionReasonCode as keyof typeof REJECTION_LABELS])}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
