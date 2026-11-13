'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

/** Whether the PDF could be drawn. */
type Outcome = 'ready' | 'error';

/** CSS pixels of a rendered page width; the canvas is drawn at device resolution. */
const PAGE_WIDTH = 720;

/**
 * Renders a PDF (signed URL) onto canvases with pdf.js: no browser PDF toolbar, hence no download
 * or print control (reference models section 13, identity documents in the RestrictedViewer).
 */
export function PdfPages({
  url,
  label,
  maxPages,
  onOutcome,
}: {
  url: string;
  label: string;
  maxPages?: number;
  onOutcome?: (outcome: Outcome) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<{ url: string; outcome: Outcome } | null>(null);
  const loading = done?.url !== url;
  const finish = useEffectEvent((outcome: Outcome) => {
    setDone({ url, outcome });
    onOutcome?.(outcome);
  });

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;

    const render = async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const task = pdfjs.getDocument({ url, withCredentials: false });
      destroy = () => task.destroy();
      const pdf = await task.promise;
      const pages = Math.min(pdf.numPages, maxPages ?? pdf.numPages);
      host.replaceChildren();
      for (let number = 1; number <= pages && !cancelled; number += 1) {
        const page = await pdf.getPage(number);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: (PAGE_WIDTH / base.width) * window.devicePixelRatio,
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${PAGE_WIDTH}px`;
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
        await page.render({ canvas, viewport }).promise;
      }
      if (!cancelled) finish('ready');
    };

    render().catch(() => {
      if (!cancelled) finish('error');
    });
    return () => {
      cancelled = true;
      void destroy?.();
      host.replaceChildren();
    };
  }, [url, maxPages]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      aria-busy={loading}
      className="flex flex-col items-center gap-3"
    />
  );
}
