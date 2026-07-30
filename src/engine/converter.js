import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '';

const FILE_TYPES = {
  'application/vnd.ms-excel': { ext: 'xls', label: 'Excel antiguo (.xls)', category: 'excel' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', label: 'Excel (.xlsx)', category: 'excel' },
  'text/csv': { ext: 'csv', label: 'CSV', category: 'csv' },
  'application/msword': { ext: 'doc', label: 'Word antiguo (.doc)', category: 'word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', label: 'Word (.docx)', category: 'word' },
  'application/pdf': { ext: 'pdf', label: 'PDF', category: 'pdf' },
};

const EXT_MAP = {
  xls: 'excel', xlsx: 'excel', csv: 'csv',
  doc: 'word', docx: 'word', pdf: 'pdf',
};

export function detectFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const mimeInfo = FILE_TYPES[file.type];
  const category = mimeInfo?.category || EXT_MAP[ext];

  if (!category) {
    return { supported: false, ext, label: `Desconocido (.${ext})` };
  }

  const label = mimeInfo?.label || ext.toUpperCase();
  const needsConversion = category === 'excel' && ext === 'xls';

  return {
    supported: true,
    ext,
    category,
    label,
    needsConversion,
    targetFormat: needsConversion ? 'xlsx' : ext,
  };
}

export async function convertFile(file, onProgress) {
  const typeInfo = detectFileType(file);

  if (!typeInfo.supported) {
    throw new Error(`Formato no soportado: .${typeInfo.ext}. Formatos permitidos: .xls, .xlsx, .csv, .doc, .docx, .pdf`);
  }

  if (onProgress) onProgress({ stage: 'reading', percent: 10, message: `Leyendo archivo ${typeInfo.label}...` });

  let result;

  switch (typeInfo.category) {
    case 'excel':
      result = await convertExcel(file, onProgress);
      break;
    case 'csv':
      result = await convertCSV(file, onProgress);
      break;
    case 'word':
      result = await convertWord(file, onProgress);
      break;
    case 'pdf':
      result = await convertPDF(file, onProgress);
      break;
    default:
      throw new Error(`Categoría no soportada: ${typeInfo.category}`);
  }

  if (onProgress) onProgress({ stage: 'done', percent: 100, message: 'Conversión completada' });

  return {
    ...result,
    originalName: file.name,
    originalType: typeInfo,
  };
}

async function convertExcel(file, onProgress) {
  if (onProgress) onProgress({ stage: 'converting', percent: 30, message: 'Procesando Excel...' });

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  const sheets = {};
  let totalRows = 0;

  workbook.SheetNames.forEach(name => {
    const ws = workbook.Sheets[name];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    sheets[name] = json;
    totalRows += json.length;
  });

  if (onProgress) onProgress({ stage: 'converting', percent: 70, message: 'Generando archivo .xlsx...' });

  const cleanedSheets = {};
  workbook.SheetNames.forEach(name => {
    cleanedSheets[name] = cleanSAGSheet(sheets[name]);
  });

  const newWb = XLSX.utils.book_new();
  Object.entries(cleanedSheets).forEach(([name, data]) => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(newWb, ws, name);
  });

  const xlsxBuffer = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const preview = buildExcelPreview(cleanedSheets, workbook.SheetNames);

  return {
    convertedBlob: blob,
    convertedName: file.name.replace(/\.[^.]+$/, '.xlsx'),
    convertedFormat: 'xlsx',
    preview,
    stats: {
      sheets: workbook.SheetNames.length,
      totalRows: cleanedSheets[workbook.SheetNames[0]]?.length ? cleanedSheets[workbook.SheetNames[0]].length - 1 : totalRows,
      sheetNames: workbook.SheetNames,
    },
  };
}

function cleanSAGSheet(rows) {
  if (!rows || rows.length < 5) return rows;

  const headerRowIndex = findDataHeaderRow(rows);
  if (headerRowIndex < 0) return rows;

  const dataRows = rows.slice(headerRowIndex);
  if (dataRows.length < 2) return rows;

  const usedCols = findUsedColumns(dataRows);
  if (!usedCols || usedCols.length === 0) return rows;

  const headerKeys = usedCols.map(ci => String(dataRows[0][ci] || '').trim());
  const isSparse = detectSparseColumns(dataRows, usedCols);
  if (!isSparse) return rows;

  const isSAGFormat = headerKeys.some(k => /^(fecha|date)$/i.test(k)) &&
    headerKeys.some(k => /^(hora|time)$/i.test(k)) &&
    headerKeys.some(k => /^pulpa/i.test(k) || /^sensor/i.test(k) || /^sonda/i.test(k) || /^%?hr$/i.test(k) || /^%?rh$/i.test(k));

  if (!isSAGFormat) return rows;

  const cleaned = dataRows.map((row, ri) => {
    return usedCols.map((ci, ki) => {
      const val = row[ci];
      const key = headerKeys[ki];
      if (ri === 0) return key;
      if (val == null || val === '') return '';
      if (isDateOrTimeColumn(key)) return val;
      if (typeof val === 'number') {
        return Math.round(val * 10) / 10;
      }
      if (typeof val === 'string') {
        const num = parseFloat(val.replace(',', '.'));
        if (!isNaN(num)) {
          return Math.round(num * 10) / 10;
        }
      }
      return val;
    });
  });

  return cleaned;
}

function findDataHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const row = rows[i];
    if (!row) continue;
    let hasDate = false, hasTime = false, hasSensor = false;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').toLowerCase().trim();
      if (!cell) continue;
      if (/^(fecha|date|fec)$/.test(cell)) hasDate = true;
      if (/^(hora|time|hor)$/.test(cell)) hasTime = true;
      if (/^pulpa/i.test(cell) || /^sensor\s*\d+/i.test(cell) || /^sonda\s*\d+/i.test(cell) ||
          /^s\d+/i.test(cell) || /^p\d+/i.test(cell) || /^%?hr$/i.test(cell) || /^%?rh$/i.test(cell) ||
          /^humedad/i.test(cell) || /^temp/i.test(cell)) hasSensor = true;
    }
    if (hasDate && hasSensor) return i;
  }
  return -1;
}

function findUsedColumns(rows) {
  const colSet = new Set();
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (row[c] != null && row[c] !== '') {
        colSet.add(c);
      }
    }
  }
  return colSet.size > 0 ? [...colSet].sort((a, b) => a - b) : null;
}

function detectSparseColumns(rows, usedCols) {
  if (usedCols.length < 2) return false;
  const totalCols = rows[0] ? rows[0].length : 0;
  if (totalCols === 0) return false;
  const ratio = (usedCols[usedCols.length - 1] + 1) / usedCols.length;
  return ratio > 3;
}

function isDateOrTimeColumn(key) {
  return /^(fecha|date|hora|time)$/i.test(String(key || '').trim());
}

async function convertCSV(file, onProgress) {
  if (onProgress) onProgress({ stage: 'converting', percent: 30, message: 'Procesando CSV...' });

  const text = await file.text();
  const workbook = XLSX.read(text, { type: 'string' });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  if (onProgress) onProgress({ stage: 'converting', percent: 70, message: 'Generando archivo .xlsx...' });

  const newWb = XLSX.utils.book_new();
  const newWs = XLSX.utils.aoa_to_sheet(json);
  XLSX.utils.book_append_sheet(newWb, newWs, 'Datos');

  const xlsxBuffer = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const preview = buildExcelPreview({ 'Datos': json }, ['Datos']);

  return {
    convertedBlob: blob,
    convertedName: file.name.replace(/\.[^.]+$/, '.xlsx'),
    convertedFormat: 'xlsx',
    preview,
    stats: { sheets: 1, totalRows: json.length, sheetNames: ['Datos'] },
  };
}

async function convertWord(file, onProgress) {
  if (onProgress) onProgress({ stage: 'converting', percent: 30, message: 'Procesando Word...' });

  const arrayBuffer = await file.arrayBuffer();

  let result;
  try {
    result = await mammoth.convertToHtml({ arrayBuffer });
  } catch (e) {
    result = await mammoth.extractRawText({ arrayBuffer });
    result.value = `<pre>${escapeHtml(result.value)}</pre>`;
  }

  if (onProgress) onProgress({ stage: 'converting', percent: 70, message: 'Generando vista previa...' });

  const html = result.value;
  const messages = result.messages || [];

  const textContent = htmlToPlainText(html);
  const textLines = textContent.split('\n').filter(l => l.trim());
  const totalLines = textLines.length;

  const rows = textLines.map(line => [line]);
  const newWb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [['(Sin contenido)']]);
  XLSX.utils.book_append_sheet(newWb, ws, 'Contenido');

  const xlsxBuffer = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  return {
    convertedBlob: blob,
    convertedName: file.name.replace(/\.[^.]+$/, '.xlsx'),
    convertedFormat: 'xlsx',
    preview: {
      type: 'html',
      html,
      textLines: textLines.slice(0, 100),
    },
    stats: {
      type: 'word',
      totalLines,
      warnings: messages.length,
    },
  };
}

async function convertPDF(file, onProgress) {
  if (onProgress) onProgress({ stage: 'converting', percent: 20, message: 'Procesando PDF...' });

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  const allText = [];

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) {
      const pct = 20 + Math.round((i / numPages) * 60);
      onProgress({ stage: 'converting', percent: pct, message: `Extrayendo página ${i}/${numPages}...` });
    }

    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const lines = [];
    let lastY = null;
    let currentLine = [];

    content.items.forEach(item => {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
        lines.push(currentLine.join(' '));
        currentLine = [];
      }
      currentLine.push(item.str);
      lastY = item.transform[5];
    });

    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    allText.push({
      page: i,
      lines: lines.filter(l => l.trim()),
    });
  }

  if (onProgress) onProgress({ stage: 'converting', percent: 85, message: 'Generando archivo Excel...' });

  const rows = [];
  allText.forEach(page => {
    page.lines.forEach(line => {
      rows.push([`Pág. ${page.page}`, line]);
    });
  });

  const newWb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [['(Sin contenido de texto)']]);
  XLSX.utils.book_append_sheet(newWb, ws, 'Texto Extraído');

  const xlsxBuffer = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const flatText = allText.flatMap(p => p.lines).join('\n');

  return {
    convertedBlob: blob,
    convertedName: file.name.replace(/\.[^.]+$/, '.xlsx'),
    convertedFormat: 'xlsx',
    preview: {
      type: 'text',
      text: flatText,
      lines: flatText.split('\n').filter(l => l.trim()).slice(0, 100),
    },
    stats: {
      type: 'pdf',
      pages: numPages,
      totalLines: allText.reduce((sum, p) => sum + p.lines.length, 0),
    },
  };
}

function buildExcelPreview(sheets, sheetNames) {
  const previews = {};

  sheetNames.forEach(name => {
    const data = sheets[name];
    if (!data || data.length === 0) {
      previews[name] = { headers: [], rows: [], totalRows: 0 };
      return;
    }

    const headerRow = data[0] || [];
    const headers = headerRow.map((h, i) => String(h || `Col ${i + 1}`));
    const rows = data.slice(1, 51).map(row =>
      headers.map((_, i) => {
        const val = row?.[i];
        return val != null ? String(val) : '';
      })
    );

    previews[name] = {
      headers,
      rows,
      totalRows: data.length - 1,
    };
  });

  return { type: 'excel', sheets: previews, sheetNames };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
