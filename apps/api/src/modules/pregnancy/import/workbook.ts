// Reads an uploaded .xlsx as untrusted data (ADR-025): bounded size, real zip signature, only the
// parts needed are inflated (counting the bytes actually produced, so a lying zip header cannot
// blow memory), formulas are never evaluated (their stored value is read and flagged), macros and
// any other part are ignored. Cell values come from read-excel-file; hyperlink targets and formula
// markers come from the sheet XML, which read-excel-file does not expose.
import { Unzip, UnzipInflate } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import { DomainError } from '../../../common/errors/domain-error.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
const MAX_PART_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_COLUMNS = 40;
const MAX_CELL_CHARS = 2000;

export interface Cell {
  text: string | null;
  /** External hyperlink target on the cell, or the URL of a HYPERLINK() formula. */
  hyperlink: string | null;
  /** The cell held a formula: its stored value was read, nothing was evaluated. */
  formula: boolean;
}

export interface Workbook {
  sheetName: string;
  /** Other sheets of the file, not read. */
  otherSheets: string[];
  /** Rows from row 1, cells from column A, as positioned in the sheet. */
  rows: Cell[][];
}

const invalid = (message: string) =>
  new DomainError('UPLOAD_INVALID', message, { fields: { file: [message] } });

/** Inflates the parts whose names pass `wanted`, refusing anything over the limits. */
function inflate(buffer: Buffer, wanted: (name: string) => boolean): Map<string, Uint8Array> {
  const parts = new Map<string, Uint8Array[]>();
  let total = 0;
  let failure: string | null = null;
  const unzip = new Unzip((file) => {
    if (failure || !wanted(file.name)) return;
    const chunks: Uint8Array[] = [];
    let size = 0;
    parts.set(file.name, chunks);
    file.ondata = (error, chunk) => {
      if (failure) return;
      if (error) {
        failure = 'The file is damaged.';
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (size > MAX_PART_BYTES || total > MAX_TOTAL_BYTES) {
        failure = 'The file expands beyond the allowed size.';
        file.terminate();
        return;
      }
      chunks.push(chunk);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), true);
  } catch {
    throw invalid('The file is not a readable .xlsx workbook.');
  }
  if (failure) throw invalid(failure);
  const joined = new Map<string, Uint8Array>();
  for (const [name, chunks] of parts) joined.set(name, Buffer.concat(chunks));
  return joined;
}

const decoder = new TextDecoder('utf-8', { fatal: false });
const xml = (part: Uint8Array | undefined) => (part ? decoder.decode(part) : '');

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of tag.matchAll(/([\w:]+)="([^"]*)"/g))
    found.set(match[1]!, unescapeXml(match[2]!));
  return found;
}

/** "AB12" → { row: 11, column: 27 } (0-based). */
export function cellAddress(ref: string): { row: number; column: number } | null {
  const match = /^([A-Z]{1,3})(\d{1,7})$/.exec(ref);
  if (!match) return null;
  let column = 0;
  for (const letter of match[1]!) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, column: column - 1 };
}

function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text: string;
  if (value instanceof Date) text = value.toISOString().slice(0, 10);
  else if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else return null;
  text = text.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, MAX_CELL_CHARS) : null;
}

export async function readWorkbook(buffer: Buffer): Promise<Workbook> {
  if (buffer.length === 0) throw invalid('The file is empty.');
  if (buffer.length > MAX_FILE_BYTES) throw invalid('The file is larger than 5 MB.');
  // An .xlsx is a zip archive: check its real signature, not the extension or the MIME type.
  if (buffer.readUInt32LE(0) !== 0x04034b50) throw invalid('The file is not an .xlsx workbook.');

  const parts = inflate(
    buffer,
    (name) =>
      name === 'xl/workbook.xml' ||
      name === 'xl/_rels/workbook.xml.rels' ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(name) ||
      /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name) ||
      name === 'xl/sharedStrings.xml' ||
      name === 'xl/styles.xml',
  );
  const workbookXml = xml(parts.get('xl/workbook.xml'));
  if (!workbookXml) throw invalid('The file is not an .xlsx workbook (no workbook part).');

  const targets = new Map<string, string>();
  for (const match of xml(parts.get('xl/_rels/workbook.xml.rels')).matchAll(
    /<Relationship\b[^>]*>/g,
  )) {
    const attrs = attributes(match[0]);
    if (attrs.get('Id') && attrs.get('Target')) targets.set(attrs.get('Id')!, attrs.get('Target')!);
  }
  const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map((match) => {
    const attrs = attributes(match[0]);
    const target = targets.get(attrs.get('r:id') ?? '') ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    return { name: attrs.get('name') ?? '', path, hidden: attrs.get('state') === 'hidden' };
  });
  if (sheets.length === 0) throw invalid('The workbook has no sheet.');

  // The first visible sheet that has data is the one imported.
  for (const sheet of sheets.filter((candidate) => !candidate.hidden)) {
    const sheetXml = xml(parts.get(sheet.path));
    if (!/<c\b/.test(sheetXml)) continue;

    let data: unknown[][];
    try {
      data = await readSheet(buffer, sheet.name);
    } catch {
      throw invalid('The sheet could not be read.');
    }
    if (data.length > MAX_ROWS + 1) throw invalid(`The sheet has more than ${MAX_ROWS} rows.`);

    const relsPath = sheet.path.replace(/worksheets\/(sheet\d+\.xml)$/, 'worksheets/_rels/$1.rels');
    const links = new Map<string, string>();
    for (const match of xml(parts.get(relsPath)).matchAll(/<Relationship\b[^>]*>/g)) {
      const attrs = attributes(match[0]);
      if (attrs.get('TargetMode') === 'External' && attrs.get('Id') && attrs.get('Target'))
        links.set(attrs.get('Id')!, attrs.get('Target')!);
    }
    const hyperlinkAt = new Map<string, string>();
    for (const match of sheetXml.matchAll(/<hyperlink\b[^>]*>/g)) {
      const attrs = attributes(match[0]);
      const target = links.get(attrs.get('r:id') ?? '');
      const ref = attrs.get('ref') ?? '';
      if (!target) continue;
      const [from, to = from] = ref.split(':');
      const start = cellAddress(from ?? '');
      const end = cellAddress(to ?? '');
      if (!start || !end) continue;
      for (let r = start.row; r <= Math.min(end.row, start.row + MAX_ROWS); r++)
        for (let c = start.column; c <= Math.min(end.column, start.column + MAX_COLUMNS); c++)
          hyperlinkAt.set(`${r}:${c}`, target);
    }
    const formulaAt = new Set<string>();
    for (const match of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const inner = match[2] ?? '';
      const formula = /<f\b[^>]*>([\s\S]*?)<\/f>|<f\b[^>]*\/>/.exec(inner);
      if (!formula) continue;
      const address = cellAddress(attributes(`<c ${match[1]}>`).get('r') ?? '');
      if (!address) continue;
      const key = `${address.row}:${address.column}`;
      formulaAt.add(key);
      const url = /^\s*HYPERLINK\(\s*"([^"]+)"/i.exec(unescapeXml(formula[1] ?? ''));
      if (url) hyperlinkAt.set(key, url[1]!);
    }

    const width = Math.min(MAX_COLUMNS, Math.max(0, ...data.map((row) => row.length)));
    const rows = data.map((row, r) =>
      Array.from({ length: width }, (_, c) => ({
        text: cellText(row[c]),
        hyperlink: hyperlinkAt.get(`${r}:${c}`)?.slice(0, MAX_CELL_CHARS) ?? null,
        formula: formulaAt.has(`${r}:${c}`),
      })),
    );
    return {
      sheetName: sheet.name,
      otherSheets: sheets.filter((other) => other.name !== sheet.name).map((other) => other.name),
      rows,
    };
  }
  throw invalid('The workbook has no sheet with data.');
}
