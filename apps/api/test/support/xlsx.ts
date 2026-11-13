// Builds small real .xlsx workbooks for import tests: inline-string cells, external hyperlinks and
// formulas with a stored value, the parts Excel writes for them.
import { zipSync, strToU8 } from 'fflate';

export type TestCell =
  string | null | { text: string; link: string } | { formula: string; value: string };

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const column = (index: number) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

export function xlsx(
  rows: TestCell[][],
  options: { sheetName?: string; extraParts?: Record<string, string> } = {},
): Buffer {
  const links: { ref: string; id: string; target: string }[] = [];
  const sheetRows = rows
    .map((cells, r) => {
      const xmlCells = cells
        .map((cell, c) => {
          const ref = `${column(c)}${r + 1}`;
          if (cell === null) return '';
          if (typeof cell === 'string')
            return `<c r="${ref}" t="inlineStr"><is><t>${escape(cell)}</t></is></c>`;
          if ('link' in cell) {
            const id = `rId${links.length + 1}`;
            links.push({ ref, id, target: cell.link });
            return `<c r="${ref}" t="inlineStr"><is><t>${escape(cell.text)}</t></is></c>`;
          }
          return `<c r="${ref}" t="str"><f>${escape(cell.formula)}</f><v>${escape(cell.value)}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${xmlCells}</row>`;
    })
    .join('');
  const hyperlinks = links.length
    ? `<hyperlinks>${links.map((l) => `<hyperlink ref="${l.ref}" r:id="${l.id}"/>`).join('')}</hyperlinks>`
    : '';
  const ns =
    'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const parts: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook ${ns}><sheets><sheet name="${escape(options.sheetName ?? 'Feuil1')}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet ${ns}><sheetData>${sheetRows}</sheetData>${hyperlinks}</worksheet>`,
    ...(links.length
      ? {
          'xl/worksheets/_rels/sheet1.xml.rels':
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            links
              .map(
                (l) =>
                  `<Relationship Id="${l.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escape(l.target)}" TargetMode="External"/>`,
              )
              .join('') +
            '</Relationships>',
        }
      : {}),
    ...(options.extraParts ?? {}),
  };
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(parts).map(([name, text]) => [name, strToU8(text)]))),
  );
}
