// Tiny Excel (.xlsx) file maker (MON-6; CORE-7 "Export to Excel" can reuse it).
// Makes a real Excel file with several tabs, colours, bold text, ₹ / date / % formats, merged cells,
// column widths, a frozen header row and filter buttons. Opens in Excel, Google Sheets and phone apps.
// No outside libraries: the file is built here (an .xlsx is a zip of small text files).
//
// makeXlsx([{ name, cols: [widths], rows: [[cell, ...], ...], merges: ['A1:E1'], heights: { 0: 30 },
//             frozenRows: 1, filter: 'A1:E20', gridLines: false }]) -> Blob
// A cell is null, a string, a number, or { v, s } where s is a style:
//   { bold, italic, size, color, fill, num: 'money' | 'date' | 'percent' | 'int', align: 'left'|'center'|'right', wrap }
//   color / fill are names from PALETTE below. A 'date' value is 'YYYY-MM-DD'; 'money' is rupees (e.g. 250.5).
// saveFile(blob, fileName) downloads it.

// The same colours as core/styles.css (light mode), as Excel colour codes.
export const PALETTE = {
  text: 'FF2F2A3D',
  muted: 'FF6B6480',
  white: 'FFFFFFFF',
  cream: 'FFFFF8F3',
  lilac: 'FFF6F1FB',
  success: 'FF1F8A4C',
  error: 'FFB3261E',
  warning: 'FF9A5B00',
  danger: 'FFFFC2BB',
  water: 'FFBFE3FF',
  sleep: 'FFD9CCFF',
  weight: 'FFC4F0DC',
  food: 'FFFFD6BD',
  money: 'FFFFF0B3',
  tasks: 'FFFFD1E3',
  reading: 'FFD7ECC4',
  bloodtests: 'FFFFC9C9',
};

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Number formats. Money uses Indian grouping (₹1,23,456.50).
const NUM_FORMATS = {
  money: { id: 164, code: '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00' },
  date: { id: 165, code: 'dd mmm yyyy' },
  percent: { id: 9 },
  int: { id: 1 },
};

const esc = (text) => String(text)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 0 -> A, 25 -> Z, 26 -> AA
function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// 'YYYY-MM-DD' -> Excel's day number.
const dateSerial = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000 + 25569;
};

const colour = (name) => PALETTE[name] || name;

// Collects the different styles used, for styles.xml.
function styleBook() {
  const fonts = ['<font><sz val="11"/><color rgb="FF2F2A3D"/><name val="Calibri"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const xfIndex = new Map();
  const indexOf = (arr, xml) => {
    let i = arr.indexOf(xml);
    if (i === -1) { arr.push(xml); i = arr.length - 1; }
    return i;
  };
  return {
    id(s) {
      if (!s) return 0;
      const key = JSON.stringify(s);
      if (xfIndex.has(key)) return xfIndex.get(key);
      const font = `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}<sz val="${s.size || 11}"/>`
        + `<color rgb="${colour(s.color || 'text')}"/><name val="Calibri"/></font>`;
      const fontId = indexOf(fonts, font);
      const fillId = s.fill
        ? indexOf(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${colour(s.fill)}"/><bgColor indexed="64"/></patternFill></fill>`)
        : 0;
      const numFmtId = s.num ? NUM_FORMATS[s.num].id : 0;
      const align = s.align || s.wrap
        ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''} vertical="center"${s.wrap ? ' wrapText="1"' : ''}/>`
        : '<alignment vertical="center"/>';
      xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"`
        + ` applyFont="1"${fillId ? ' applyFill="1"' : ''}${numFmtId ? ' applyNumberFormat="1"' : ''} applyAlignment="1">${align}</xf>`);
      xfIndex.set(key, xfs.length - 1);
      return xfs.length - 1;
    },
    xml() {
      const custom = Object.values(NUM_FORMATS).filter((f) => f.code);
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + `<numFmts count="${custom.length}">${custom.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code)}"/>`).join('')}</numFmts>`
        + `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`
        + `<fills count="${fills.length}">${fills.join('')}</fills>`
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>';
    },
  };
}

function sheetXml(sheet, styles) {
  const rows = sheet.rows.map((row, r) => {
    const height = sheet.heights?.[r];
    const cells = row.map((cell, c) => {
      if (cell === null || cell === undefined) return '';
      const { v, s } = typeof cell === 'object' ? cell : { v: cell };
      const ref = `${colName(c)}${r + 1}`;
      const style = styles.id(s);
      const st = style ? ` s="${style}"` : '';
      if (v === null || v === undefined || v === '') return style ? `<c r="${ref}"${st}/>` : '';
      if (s?.num === 'date') return `<c r="${ref}"${st}><v>${dateSerial(v)}</v></c>`;
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      // Text is always stored as text, so nothing typed in the app can turn into a formula.
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`;
  }).join('');
  const frozen = sheet.frozenRows
    ? `<pane ySplit="${sheet.frozenRows}" topLeftCell="A${sheet.frozenRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const cols = sheet.cols?.length
    ? `<cols>${sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetViews><sheetView workbookViewId="0"${sheet.gridLines === false ? ' showGridLines="0"' : ''}>${frozen}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="18" customHeight="1"/>'
    + `${cols}<sheetData>${rows}</sheetData>`
    + `${sheet.filter ? `<autoFilter ref="${sheet.filter}"/>` : ''}${merges}`
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '</worksheet>';
}

// ---- Zip (files stored as they are, no squeezing; plenty for a small spreadsheet) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const { name, text } of files) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(local, nameBytes, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: MIME });
}

export function makeXlsx(sheets) {
  const styles = styleBook();
  const sheetFiles = sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(sheet, styles) }));
  const names = sheets.map((s) => esc(String(s.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
  const filters = sheets.map((s, i) => (s.filter
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i]}'!$${s.filter.replace(':', ':$').replace(/([A-Z]+)(\d+)/g, '$1$$$2')}</definedName>`
    : '')).join('');
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
    + `${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>`;
  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return zip([
    {
      name: '[Content_Types].xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    { name: 'xl/workbook.xml', text: workbook },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}`
        + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + '</Relationships>',
    },
    ...sheetFiles,
    { name: 'xl/styles.xml', text: styles.xml() },
  ]);
}

// Downloads a file (e.g. the Blob from makeXlsx) to the phone's or computer's Downloads.
export function saveFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
