'use client';

import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';

interface Person {
  id: string;
  fullName: string;
}

/** What a version carries about its sign-offs (ADR-024). */
export interface SignOffState {
  status: string;
  requiredSignOffs: number;
  firstSignOffBy: Person | null;
  firstSignOffNote: string | null;
  firstSignOffAt: string | null;
}

/** The step an approval by the current admin performs, with its labels. */
export interface ApprovalStep {
  /** The current admin gave the first sign-off and may not give the second. */
  signedByMe: boolean;
  /** This approval records the first of two sign-offs instead of publishing. */
  firstOfTwo: boolean;
  label: MessageKey;
  /** Replaces the dialog's own title and text for a first sign-off or a second one. */
  title: MessageKey | null;
  body: MessageKey | null;
}

export function approvalStep(
  version: SignOffState,
  meId: string | undefined,
  publishLabel: MessageKey,
): ApprovalStep {
  const signedByMe = version.firstSignOffBy !== null && version.firstSignOffBy.id === meId;
  if (version.requiredSignOffs < 2) {
    return { signedByMe, firstOfTwo: false, label: publishLabel, title: null, body: null };
  }
  if (version.firstSignOffBy === null) {
    return {
      signedByMe,
      firstOfTwo: true,
      label: 'admin.review.signFirst',
      title: 'admin.review.signFirstTitle',
      body: 'admin.review.signFirstBody',
    };
  }
  return {
    signedByMe,
    firstOfTwo: false,
    label: 'admin.review.signSecond',
    title: null,
    body: 'admin.review.signSecondBody',
  };
}

/** Rows for a version's description list: « Relectures 1 sur 2 » and the first sign-off. */
export function SignOffRows({ version }: { version: SignOffState }) {
  const { t, locale } = useI18n();
  if (version.requiredSignOffs < 2 && version.firstSignOffBy === null) return null;
  const published =
    version.status !== 'DRAFT' &&
    version.status !== 'IN_REVIEW' &&
    version.status !== 'CHANGES_REQUESTED';
  const done = published ? version.requiredSignOffs : version.firstSignOffBy ? 1 : 0;
  return (
    <>
      <dt>{t('admin.review.signOffs')}</dt>
      <dd>{t('admin.review.progress', { done, required: version.requiredSignOffs })}</dd>
      {version.firstSignOffBy ? (
        <>
          <dt>{t('admin.review.firstSignOff')}</dt>
          <dd>
            {version.firstSignOffBy.fullName}
            {version.firstSignOffAt ? ` · ${formatDateTime(locale, version.firstSignOffAt)}` : ''}
          </dd>
          <dt>{t('admin.review.firstSignOffNote')}</dt>
          <dd>{version.firstSignOffNote ?? '—'}</dd>
        </>
      ) : null}
    </>
  );
}
