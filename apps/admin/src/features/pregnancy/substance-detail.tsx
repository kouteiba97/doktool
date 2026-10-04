'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, GitBranchPlus, Pencil, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, call } from '@/api/client';
import { formatDate, formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import { useGrants } from '@/session/session';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, PageHeader, Skeleton } from '@/ui/feedback';
import { Switch } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';
import { SourceDialog, SubstanceDialog } from './dialogs';
import {
  isEditable,
  isOpenStatus,
  type ProfileVersion,
  sourcesKey,
  type SubstanceDetail,
  substanceKey,
  substancesKey,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_TONES,
  versionKey,
} from './labels';
import { ProfileEditor } from './profile-editor';
import { ReviewComment } from './profile-view';

type Action = 'newVersion' | 'submit' | 'discard' | 'approve' | 'changes' | null;

/** One substance: versions on the left, the selected version (editor, review) on the right. */
export function SubstanceDetailPage({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { has, me } = useGrants();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [visibility, setVisibility] = useState<{ demoSample?: boolean; enabled?: boolean } | null>(
    null,
  );

  const detail = useQuery({
    queryKey: substanceKey(id),
    queryFn: () =>
      call(api.GET('/admin/v1/pregnancy/substances/{id}', { params: { path: { id } } })),
  });
  const substances = useQuery({
    queryKey: substancesKey,
    queryFn: () => call(api.GET('/admin/v1/pregnancy/substances')),
  });
  const registry = useQuery({
    queryKey: sourcesKey,
    queryFn: () => call(api.GET('/admin/v1/pregnancy/sources')),
  });
  const substance = detail.data;
  const current =
    substance?.versions.find((item) => item.id === selected) ??
    substance?.versions.find((item) => isOpenStatus(item.status)) ??
    substance?.versions[0];
  const version = useQuery({
    queryKey: versionKey(current?.id ?? ''),
    enabled: current !== undefined,
    queryFn: () =>
      call(
        api.GET('/admin/v1/pregnancy/versions/{versionId}', {
          params: { path: { versionId: current!.id } },
        }),
      ),
  });

  const refresh = async (versionId?: string) => {
    await queryClient.invalidateQueries({ queryKey: substanceKey(id) });
    if (versionId) await queryClient.invalidateQueries({ queryKey: versionKey(versionId) });
    void queryClient.invalidateQueries({ queryKey: substancesKey, exact: true });
  };

  if (detail.isPending) return <Skeleton lines={10} />;
  if (detail.isError || !substance) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(detail.error)}
      </EmptyState>
    );
  }

  const open = substance.versions.find((item) => isOpenStatus(item.status));
  const loaded = version.data;
  const mine = loaded?.authoredBy.id === me?.id;
  const canEdit =
    loaded !== undefined && isEditable(loaded.status) && mine && has('pregnancy.draft');
  const canReview = loaded?.status === 'IN_REVIEW' && !mine && has('pregnancy.review');

  return (
    <>
      <Link href="/admin/pregnancy" className="dt-row-flex dt-cap w-fit">
        <ArrowLeft size={14} aria-hidden />
        {t('admin.pregnancy.backToList')}
      </Link>
      <PageHeader
        title={locale === 'en' && substance.nameEn ? substance.nameEn : substance.nameFr}
        caption={
          <span className="dt-row-flex">
            {substance.atcCode ? <span className="dt-mono">{substance.atcCode}</span> : null}
            <Badge tone={substance.enabled ? 'success' : 'outline'}>
              {substance.enabled ? t('admin.pregnancy.enabled') : t('admin.pregnancy.disabled')}
            </Badge>
            {substance.demoSample ? <Badge tone="teal">{t('admin.library.demo')}</Badge> : null}
            {substance.synonyms.length > 0 ? (
              <span className="dt-cap">{substance.synonyms.join(' · ')}</span>
            ) : null}
          </span>
        }
        actions={
          has('pregnancy.draft') ? (
            <>
              <Button onClick={() => setEditing(true)}>
                <Pencil size={16} aria-hidden />
                {t('admin.pregnancy.editSubstance')}
              </Button>
              <Button
                variant="primary"
                disabled={open !== undefined}
                title={open ? t('admin.pregnancy.versionOpen') : undefined}
                onClick={() => setAction('newVersion')}
              >
                <GitBranchPlus size={16} aria-hidden />
                {t('admin.pregnancy.newVersion')}
              </Button>
            </>
          ) : null
        }
      />

      {has('pregnancy.review') ? (
        <section
          className="dt-card dt-row-flex gap-6 p-4"
          aria-label={t('admin.pregnancy.visibility')}
        >
          <b>{t('admin.pregnancy.visibility')}</b>
          <Switch
            checked={substance.enabled}
            onChange={(enabled) => setVisibility({ enabled })}
            label={t('admin.pregnancy.enabledToggle')}
          />
          <Switch
            checked={substance.demoSample}
            onChange={(demoSample) => setVisibility({ demoSample })}
            label={t('admin.pregnancy.demoToggle')}
          />
        </section>
      ) : null}

      <div className="grid grid-cols-[var(--size-sidebar)_minmax(0,1fr)] gap-4">
        <nav aria-label={t('admin.pregnancy.versions')} className="dt-stack">
          <h2 className="dt-label">{t('admin.pregnancy.versions')}</h2>
          {substance.versions.length === 0 ? (
            <p className="dt-cap">{t('admin.pregnancy.noVersions')}</p>
          ) : (
            <ol className="dt-stack gap-1">
              {substance.versions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={item.id === current?.id ? 'true' : undefined}
                    className={`dt-card w-full gap-1 p-3 text-start ${item.id === current?.id ? 'border-brand bg-brand-soft' : ''}`}
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
          {!current ? (
            <EmptyState icon={GitBranchPlus} title={t('admin.pregnancy.noVersions')}>
              {t('admin.pregnancy.noVersionsBody')}
            </EmptyState>
          ) : version.isPending ? (
            <Skeleton lines={8} />
          ) : version.isError || !loaded ? (
            <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
              {errorText(version.error)}
            </EmptyState>
          ) : (
            <div className="dt-stack gap-3">
              <VersionHeader version={loaded} />
              {loaded.status === 'CHANGES_REQUESTED' && loaded.reviewComment ? (
                <ReviewComment comment={loaded.reviewComment} />
              ) : null}
              {isEditable(loaded.status) && !mine ? (
                <Alert tone="info">
                  {t('admin.pregnancy.notYourDraft', { name: loaded.authoredBy.fullName })}
                </Alert>
              ) : null}
              {loaded.status === 'IN_REVIEW' && mine ? (
                <Alert tone="info">{t('admin.pregnancy.waitingForReviewer')}</Alert>
              ) : null}
              {isEditable(loaded.status) && loaded.problems.length > 0 ? (
                <Alert tone="warning" title={t('admin.pregnancy.missingTitle')}>
                  <ul className="list-disc ps-5">
                    {loaded.problems.map((problem) => (
                      <li key={problem} className="dt-mono dt-cap">
                        {problem}
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
              <div className="dt-row-flex">
                {canEdit ? (
                  <>
                    <Button
                      variant="primary"
                      disabled={loaded.problems.length > 0}
                      onClick={() => setAction('submit')}
                    >
                      <Send size={16} aria-hidden />
                      {t('admin.pregnancy.submit')}
                    </Button>
                    <Button variant="ghost" onClick={() => setAction('discard')}>
                      <Trash2 size={16} aria-hidden />
                      {t('admin.pregnancy.discard')}
                    </Button>
                  </>
                ) : null}
                {canReview ? (
                  <>
                    <Button variant="primary" onClick={() => setAction('approve')}>
                      {t('admin.pregnancy.approve')}
                    </Button>
                    <Button onClick={() => setAction('changes')}>
                      {t('admin.pregnancy.requestChanges')}
                    </Button>
                  </>
                ) : null}
              </div>
              <ProfileEditor
                key={`${loaded.id}-${loaded.updatedAt}`}
                version={loaded}
                substances={substances.data ?? []}
                registry={registry.data ?? []}
                editable={canEdit}
                onAddSource={() => setAddingSource(true)}
                onSaved={(saved) => {
                  queryClient.setQueryData(versionKey(saved.id), saved);
                  void refresh();
                }}
              />
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <SubstanceDialog
          substance={substance}
          open
          onOpenChange={setEditing}
          onSaved={(saved: SubstanceDetail) => {
            queryClient.setQueryData(substanceKey(saved.id), saved);
            void queryClient.invalidateQueries({ queryKey: substancesKey, exact: true });
            toast(t('admin.pregnancy.substanceSaved'));
          }}
        />
      ) : null}
      {addingSource ? (
        <SourceDialog
          source={null}
          open
          onOpenChange={setAddingSource}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: sourcesKey });
            toast(t('admin.pregnancy.sourceSaved'));
          }}
        />
      ) : null}

      <ReasonDialog
        open={visibility !== null}
        onOpenChange={(next) => (next ? undefined : setVisibility(null))}
        title={t('admin.pregnancy.visibilityTitle')}
        description={
          visibility?.enabled === false
            ? t('admin.pregnancy.disableBody')
            : visibility?.demoSample !== undefined
              ? t('admin.pregnancy.demoBody')
              : t('admin.pregnancy.enableBody')
        }
        confirmLabel={t('admin.common.save')}
        onConfirm={async (reason) => {
          await call(
            api.PATCH('/admin/v1/pregnancy/substances/{id}/visibility', {
              params: { path: { id } },
              body: { ...visibility, reason },
            }),
          );
          await refresh();
          toast(t('admin.pregnancy.substanceSaved'));
        }}
      />
      <ReasonDialog
        open={action === 'newVersion'}
        onOpenChange={(next) => setAction(next ? 'newVersion' : null)}
        title={t('admin.pregnancy.newVersion')}
        description={t('admin.pregnancy.newVersionBody')}
        confirmLabel={t('admin.pregnancy.createDraft')}
        onConfirm={async (reason) => {
          const created = await call(
            api.POST('/admin/v1/pregnancy/substances/{id}/versions', {
              params: { path: { id } },
              body: { reason },
            }),
          );
          await refresh();
          setSelected(created.id);
          toast(t('admin.pregnancy.versionCreated', { version: created.version }));
        }}
      />
      {loaded ? (
        <>
          <ReasonDialog
            open={action === 'submit'}
            onOpenChange={(next) => setAction(next ? 'submit' : null)}
            title={t('admin.pregnancy.submit')}
            description={t('admin.pregnancy.submitBody')}
            confirmLabel={t('admin.pregnancy.submit')}
            onConfirm={async (reason) => {
              await call(
                api.POST('/admin/v1/pregnancy/versions/{versionId}/submit', {
                  params: { path: { versionId: loaded.id } },
                  body: { reason },
                }),
              );
              await refresh(loaded.id);
              toast(t('admin.pregnancy.submitted'));
            }}
          />
          <ReasonDialog
            open={action === 'discard'}
            onOpenChange={(next) => setAction(next ? 'discard' : null)}
            title={t('admin.pregnancy.discard')}
            description={t('admin.pregnancy.discardBody')}
            confirmLabel={t('admin.pregnancy.discard')}
            confirmVariant="danger"
            onConfirm={async (reason) => {
              await call(
                api.DELETE('/admin/v1/pregnancy/versions/{versionId}', {
                  params: { path: { versionId: loaded.id } },
                  body: { reason },
                }),
              );
              setSelected(null);
              await refresh();
              toast(t('admin.pregnancy.discarded'));
            }}
          />
          <ReasonDialog
            open={action === 'approve'}
            onOpenChange={(next) => setAction(next ? 'approve' : null)}
            title={t('admin.pregnancy.approveTitle', { version: loaded.version })}
            description={t('admin.pregnancy.approveBody')}
            confirmLabel={t('admin.pregnancy.approve')}
            onConfirm={async (comment) => {
              await call(
                api.POST('/admin/v1/pregnancy/versions/{versionId}/approve', {
                  params: { path: { versionId: loaded.id } },
                  body: { comment },
                }),
              );
              await refresh(loaded.id);
              toast(t('admin.pregnancy.published', { version: loaded.version }));
            }}
          />
          <ReasonDialog
            open={action === 'changes'}
            onOpenChange={(next) => setAction(next ? 'changes' : null)}
            title={t('admin.pregnancy.requestChanges')}
            description={t('admin.pregnancy.requestChangesBody')}
            confirmLabel={t('admin.pregnancy.requestChanges')}
            onConfirm={async (comment) => {
              await call(
                api.POST('/admin/v1/pregnancy/versions/{versionId}/request-changes', {
                  params: { path: { versionId: loaded.id } },
                  body: { comment },
                }),
              );
              await refresh(loaded.id);
              toast(t('admin.pregnancy.changesRequested'));
            }}
          />
        </>
      ) : null}
    </>
  );
}

/** Lifecycle of the selected version: who wrote it, who reviewed it, when it went live. */
function VersionHeader({ version }: { version: ProfileVersion }) {
  const { t, locale } = useI18n();
  return (
    <div className="dt-stack gap-1">
      <div className="dt-row-flex">
        <h2 className="dt-title">
          {t('admin.pregnancy.versionTitle', { version: version.version })}
        </h2>
        <Badge tone={VERSION_STATUS_TONES[version.status]}>
          {t(VERSION_STATUS_LABELS[version.status])}
        </Badge>
      </div>
      <dl className="dt-dl">
        <dt>{t('admin.pregnancy.author')}</dt>
        <dd>
          {version.authoredBy.fullName} · {formatDateTime(locale, version.createdAt)}
        </dd>
        <dt>{t('admin.pregnancy.changeReason')}</dt>
        <dd>{version.changeReason}</dd>
        {version.reviewedBy ? (
          <>
            <dt>{t('admin.pregnancy.reviewer')}</dt>
            <dd>
              {version.reviewedBy.fullName}
              {version.publishedAt ? ` · ${formatDateTime(locale, version.publishedAt)}` : ''}
            </dd>
          </>
        ) : null}
        {version.reviewComment && version.status !== 'CHANGES_REQUESTED' ? (
          <>
            <dt>{t('admin.pregnancy.reviewerComment')}</dt>
            <dd>{version.reviewComment}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
