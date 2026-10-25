// CSV cells shared by every export (finance reports, audit log).

/**
 * One CSV cell: quoted when it holds a separator, a quote or a line break. Text a spreadsheet would
 * run as a formula (=, +, -, @, tab, carriage return first) gets a leading apostrophe; numbers,
 * negative ones included, are kept as numbers.
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
