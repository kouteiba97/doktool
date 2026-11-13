'use client';

import { FileText, Upload } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';
import { formatBytes } from '@/i18n/format';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { type PdfProblem, pdfProblem } from './upload';

/** Catalogue key of each refusal reason. */
const PROBLEMS: Record<PdfProblem, MessageKey> = {
  type: 'admin.library.fileNotPdf',
  size: 'admin.library.fileTooLarge',
  empty: 'admin.library.fileEmpty',
};

/** PDF drop zone (component FileUpload): drag and drop or click to choose; one PDF, ≤ 20 MB. */
export function PdfDrop({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const { t, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<PdfProblem | null>(null);

  // Checks a picked or dropped file; only an acceptable PDF is passed on.
  const accept = (picked: File | undefined) => {
    if (!picked) return;
    const found = pdfProblem(picked);
    setProblem(found);
    onFile(found ? null : picked);
  };
  // A file dropped on the zone.
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    accept(event.dataTransfer.files[0]);
  };

  return (
    <div className="dt-stack gap-2">
      {/* The drop zone: click to choose a PDF, or drop one on it. */}
      <button
        type="button"
        className={`dt-drop${over ? ' over' : ''}${problem ? ' error' : ''}`}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {file ? <FileText aria-hidden /> : <Upload aria-hidden />}
        {file ? (
          <>
            <b className="break-all">{file.name}</b>
            <span className="dt-cap">{formatBytes(locale, file.size)}</span>
          </>
        ) : (
          <b>{t('admin.library.dropTitle')}</b>
        )}
        <span id={hintId} className="dt-cap">
          {file ? t('admin.library.dropReplace') : t('admin.library.dropHint')}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {problem ? (
        <p className="dt-help error" role="alert">
          {t(PROBLEMS[problem])}
        </p>
      ) : null}
    </div>
  );
}
