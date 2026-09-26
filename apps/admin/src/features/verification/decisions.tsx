'use client';

import { useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Field, Select, TextArea, TextInput } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { REJECTION_LABELS, REJECTION_REASONS, type RejectionReason } from './labels';

type Case = Schemas['AdminVerificationCaseDto'];

interface DecisionProps {
  record: Case;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (next: Case) => void;
}

const path = (record: Case) => ({ params: { path: { id: record.id } } });

/** « Approuver »: optional end of validity (the document's own expiry), and the reason. */
export function ApproveDialog({ record, open, onOpenChange, onDone }: DecisionProps) {
  const { t } = useI18n();
  const [expiresOn, setExpiresOn] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const valid = expiresOn === '' || expiresOn > today;
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('admin.verification.approveTitle')}
      description={t('admin.verification.approveBody')}
      confirmLabel={t('admin.verification.approve')}
      ready={valid}
      onConfirm={async (reason) =>
        onDone(
          await call(
            api.POST('/admin/v1/verification/cases/{id}/approve', {
              ...path(record),
              body: {
                reason,
                ...(expiresOn
                  ? { expiresAt: new Date(`${expiresOn}T23:59:59Z`).toISOString() }
                  : {}),
              },
            }),
          ),
        )
      }
    >
      <Field
        label={t('admin.verification.expiresOn')}
        help={t('admin.verification.expiresOnHelp')}
        error={valid ? undefined : t('admin.verification.expiresOnInvalid')}
      >
        {({ inputId, describedBy, invalid }) => (
          <TextInput
            id={inputId}
            type="date"
            min={today}
            value={expiresOn}
            aria-describedby={describedBy}
            invalid={invalid}
            onChange={(event) => setExpiresOn(event.target.value)}
          />
        )}
      </Field>
    </ReasonDialog>
  );
}

/**
 * « Rejeter »: reason from the closed list, and the note shown to the person saying which step to
 * redo — this is how a reviewer asks for a complement.
 */
export function RejectDialog({ record, open, onOpenChange, onDone }: DecisionProps) {
  const { t } = useI18n();
  const [code, setCode] = useState<RejectionReason | ''>('');
  const [note, setNote] = useState('');
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('admin.verification.rejectTitle')}
      description={t('admin.verification.rejectBody')}
      confirmLabel={t('admin.verification.reject')}
      confirmVariant="danger"
      ready={code !== ''}
      onConfirm={async (reason) => {
        if (code === '') return;
        const trimmed = note.trim();
        onDone(
          await call(
            api.POST('/admin/v1/verification/cases/{id}/reject', {
              ...path(record),
              body: { reason, reasonCode: code, ...(trimmed ? { note: trimmed } : {}) },
            }),
          ),
        );
      }}
    >
      <Field label={t('admin.verification.rejectReason')} required>
        {({ inputId, describedBy }) => (
          <Select
            id={inputId}
            aria-describedby={describedBy}
            value={code}
            onChange={(event) => setCode(event.target.value as RejectionReason | '')}
          >
            <option value="" disabled>
              {t('admin.common.choose')}
            </option>
            {REJECTION_REASONS.map((value) => (
              <option key={value} value={value}>
                {t(REJECTION_LABELS[value])}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t('admin.verification.rejectNote')}
        help={t('admin.verification.rejectNoteHelp')}
      >
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
    </ReasonDialog>
  );
}

/** « Libérer »: back to the queue for another reviewer. */
export function ReleaseDialog({ record, open, onOpenChange, onDone }: DecisionProps) {
  const { t } = useI18n();
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('admin.verification.releaseTitle')}
      description={t('admin.verification.releaseBody')}
      confirmLabel={t('admin.verification.release')}
      onConfirm={async (reason) =>
        onDone(
          await call(
            api.POST('/admin/v1/verification/cases/{id}/release', {
              ...path(record),
              body: { reason },
            }),
          ),
        )
      }
    />
  );
}
