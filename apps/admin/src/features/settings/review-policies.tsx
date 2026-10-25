'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useErrorText } from '@/ui/errors';
import { Alert, EmptyState, Skeleton } from '@/ui/feedback';
import { Switch } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { useToast } from '@/ui/toast';

/** A sign-off policy as the API returns it. */
type Policy = Schemas['ReviewPolicyDto'];
type Content = Policy['content'];

const policiesKey = ['admin', 'clinical-review', 'policies'] as const;

const CONTENT_LABELS: Record<Content, MessageKey> = {
  CALCULATOR: 'admin.settings.reviewCalculator',
  PREGNANCY_PROFILE: 'admin.settings.reviewPregnancy',
};

/**
 * « Relecture clinique » (ADR-024): one review by default — the person who publishes, never the
 * author — or two independent reviews, per kind of clinical content. Every change asks for a
 * reason and is audited.
 */
export function ReviewPolicies() {
  const { t } = useI18n();
  const errorText = useErrorText();
  // Both policies (calculators, pregnancy profiles).
  const policies = useQuery({
    queryKey: policiesKey,
    queryFn: () => call(api.GET('/admin/v1/clinical-review/policies')),
  });
  if (policies.isPending) return <Skeleton lines={4} />;
  if (policies.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(policies.error)}
      </EmptyState>
    );
  }
  return (
    <div className="dt-stack gap-4">
      <p className="dt-cap max-w-prose">{t('admin.settings.reviewIntro')}</p>
      {policies.data.map((policy) => (
        <PolicyCard key={policy.content} policy={policy} />
      ))}
    </div>
  );
}

/** One policy: one or two sign-offs, how many admins may approve, who last changed it. */
function PolicyCard({ policy }: { policy: Policy }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<1 | 2 | null>(null);
  const content = t(CONTENT_LABELS[policy.content]);
  const two = policy.requiredSignOffs === 2;
  const tooFew = policy.eligibleReviewers < 2;
  return (
    <section className="dt-card dt-stack gap-2">
      <h3 className="dt-heading">{content}</h3>
      <Switch
        checked={two}
        disabled={!two && tooFew}
        onChange={(checked) => setTarget(checked ? 2 : 1)}
        label={t('admin.settings.reviewTwo')}
      />
      <p className="dt-cap">
        {t('admin.settings.reviewEligible', { count: policy.eligibleReviewers })}
      </p>
      {!two && tooFew ? <Alert tone="info">{t('admin.settings.reviewTooFew')}</Alert> : null}
      {policy.updatedBy && policy.updatedAt ? (
        <p className="dt-cap">
          {t('admin.settings.reviewUpdated', {
            name: policy.updatedBy.fullName,
            date: formatDateTime(locale, policy.updatedAt),
          })}
        </p>
      ) : null}
      <ReasonDialog
        open={target !== null}
        onOpenChange={(open) => (open ? undefined : setTarget(null))}
        title={t(
          target === 2 ? 'admin.settings.reviewEnableTitle' : 'admin.settings.reviewDisableTitle',
          { content },
        )}
        description={t(
          target === 2 ? 'admin.settings.reviewEnableBody' : 'admin.settings.reviewDisableBody',
        )}
        confirmLabel={t('admin.common.save')}
        onConfirm={async (reason) => {
          if (target === null) return;
          await call(
            api.PUT('/admin/v1/clinical-review/policies/{content}', {
              params: { path: { content: policy.content } },
              body: { requiredSignOffs: target, reason },
            }),
          );
          await queryClient.invalidateQueries({ queryKey: policiesKey });
          toast(t('admin.settings.reviewSaved'));
        }}
      />
    </section>
  );
}
