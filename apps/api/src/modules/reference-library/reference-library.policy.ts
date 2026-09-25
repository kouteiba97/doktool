// Reference Library rules (design system section 13).

export const TITLE_MAX_LENGTH = 200;
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;
export const PDF_CONTENT_TYPE = 'application/pdf';

/** Queue fed after each upload, and the minute sweep that catches anything the queue missed. */
export const PROCESS_FILE_JOB = 'reference-library.process-file';
export const PROCESS_PENDING_SWEEP = 'reference-library.process-pending';

/**
 * Display title proposed from the uploaded file name (section 13: "pre-filled from the file name").
 * "angine_adulte-v2.pdf" → "angine adulte v2".
 */
export function suggestTitle(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX_LENGTH);
}

/** Accent- and case-insensitive form used for title matching ("Céphalée" ~ "cephalee"). */
export function normaliseForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** A–Z order of the French display title (section 13). */
export function compareTitles(a: { titleFr: string }, b: { titleFr: string }): number {
  return collator.compare(a.titleFr, b.titleFr);
}
