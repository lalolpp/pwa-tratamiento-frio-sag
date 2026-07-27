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

  const newWb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, data]) => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(newWb, ws, name);
  });

  const xlsxBuffer = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const preview = buildExcelPreview(sheets, workbook.SheetNames);

  return {
    convertedBlob: blob,
    convertedName: file.name.replace(/\.[^.]+$/, '.xlsx'),
    convertedFormat: 'xlsx',
    preview,
    stats: {
      sheets: workbook.SheetNames.length,
      totalRows,
      sheetNames: workbook.SheetNames,
    },
  };
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
