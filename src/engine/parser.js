import * as XLSX from 'xlsx';

const SENSOR_PATTERNS = [
  /^sensor\s*\d+/i,
  /^s\d+/i,
  /^pulpa\s*\d+/i,
  /^p\d+/i,
  /^sonda\s*\d+/i,
  /^probe\s*\d+/i,
  /^temp\s*\d+/i,
  /^%?hr$/i,
  /^%?rh$/i,
  /^humedad/i,
  /^hum/i,
  /^\d+\.?\s*°?[cCfF]?/,
];

const ENGLISH_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const DATE_PATTERNS = [
  /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
  /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})/i,
];

const MISSING_VALUES = [null, undefined, '', 'N/A', 'n/a', '---', '--', '-', 'NA', 'S/D', 'sin dato', 'ERROR', 'ERR'];

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        console.log('[Parser] Sheets:', workbook.SheetNames);
        console.log('[Parser] Sheet ref:', sheet['!ref']);

        let jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        console.log('[Parser] Rows from sheet_to_json:', jsonData.length);

        let headerInfo = detectHeaders(jsonData);

        if (!headerInfo && sheet['!ref']) {
          console.log('[Parser] sheet_to_json failed, trying raw cell map...');
          jsonData = readRawCellMap(sheet);
          console.log('[Parser] Rows from raw cell map:', jsonData.length);
          headerInfo = detectHeaders(jsonData);
        }

        if (!headerInfo) {
          let debugInfo = `[Parser] sheet_to_json rows: ${jsonData.length}\n`;
          debugInfo += `[Parser] Sheets: ${workbook.SheetNames}\n`;
          debugInfo += `[Parser] Sheet ref: ${sheet['!ref']}\n`;
          for (let i = 0; i < Math.min(50, jsonData.length); i++) {
            const row = jsonData[i];
            if (!row) continue;
            const nonEmpty = [];
            for (let j = 0; j < row.length; j++) {
              if (row[j] != null && row[j] !== '') {
                nonEmpty.push(`C${j}=${JSON.stringify(row[j])}`);
              }
            }
            if (nonEmpty.length > 0) debugInfo += `Row ${i} (len=${row.length}): ${nonEmpty.join(' | ')}\n`;
          }
          console.log(debugInfo);
          throw new Error(debugInfo);
        }

        console.log('[Parser] Headers found! Processing data...');
        const result = processSheetData(jsonData, headerInfo);
        resolve(result);
      } catch (error) {
        console.error('[Parser] Error:', error);
        reject(new Error(`Error al procesar el archivo: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

function readRawCellMap(sheet) {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const maxRow = range.e.r;
  const maxCol = range.e.c;
  const rows = [];

  for (let r = 0; r <= maxRow; r++) {
    const row = new Array(maxCol + 1).fill(null);
    for (let c = 0; c <= maxCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (sheet[addr]) {
        row[c] = sheet[addr].v;
      }
    }
    rows.push(row);
  }

  return rows;
}

function processSheetData(rows, headerInfo) {
  const { headerRow, dateCol, timeCol, sensorColumns, startIndex } = headerInfo;

  const records = [];
  const sensorNames = sensorColumns.map(c => headerRow[c]);

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const timestamp = parseTimestamp(row[dateCol], row[timeCol]);
    if (!timestamp) continue;

    const sensors = {};
    let hasAnySensor = false;

    sensorColumns.forEach((colIdx, sensorIdx) => {
      const rawValue = row[colIdx];
      const sensorName = sensorNames[sensorIdx];
      const parsed = parseSensorValue(rawValue, sensorName);

      if (parsed.isValid) hasAnySensor = true;
      sensors[sensorName] = parsed;
    });

    if (hasAnySensor) {
      records.push({ timestamp, sensors });
    }
  }

  if (records.length === 0) {
    throw new Error('No se encontraron registros válidos en el archivo');
  }

  const gaps = detectGaps(records);
  const sensorStats = computeSensorStats(records, sensorNames);

  return {
    sensorNames,
    records,
    metadata: extractMetadata(rows),
    stats: {
      totalRecords: records.length,
      missingRecords: records.filter(r =>
        Object.values(r.sensors).every(s => !s.isValid)
      ).length,
      gaps,
      sensorStats,
      dateRange: {
        start: records[0].timestamp,
        end: records[records.length - 1].timestamp,
      },
    },
  };
}

function detectHeaders(rows) {
  console.log('[Parser] Scanning', Math.min(rows.length, 60), 'rows for headers');

  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const row = rows[i];
    if (!row) continue;

    let dateCol = -1;
    let timeCol = -1;
    const sensorCols = [];

    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').toLowerCase().trim();
      if (!cell) continue;

      if (isDateHeader(cell)) {
        dateCol = j;
      } else if (isTimeHeader(cell)) {
        timeCol = j;
      } else if (isSensorHeader(cell)) {
        sensorCols.push(j);
      }
    }

    if (dateCol >= 0 || sensorCols.length > 0 || timeCol >= 0) {
      console.log(`[Parser] Row ${i}: dateCol=${dateCol}, timeCol=${timeCol}, sensors=${sensorCols.length}, rowLen=${row.length}`);
    }

    if (dateCol >= 0 && sensorCols.length >= 1) {
      console.log(`[Parser] HEADERS FOUND at row ${i}: dateCol=${dateCol}, timeCol=${timeCol}, sensors=${sensorCols.length}`);
      return {
        headerRow: row.map(h => String(h || '').trim()),
        dateCol,
        timeCol,
        sensorColumns: sensorCols,
        startIndex: i + 1,
      };
    }
  }

  console.log('[Parser] No headers found in first 60 rows');
  return null;
}

function isDateHeader(text) {
  return /^(fecha|date|fec|dt)$/i.test(text);
}

function isTimeHeader(text) {
  return /^(hora|time|hor|h)$/i.test(text);
}

function isSensorHeader(text) {
  return SENSOR_PATTERNS.some(p => p.test(text));
}

function parseTimestamp(dateVal, timeVal) {
  if (!dateVal) return null;

  const dateStr = String(dateVal).trim();
  let date = null;

  for (const pattern of DATE_PATTERNS) {
    const match = dateStr.match(pattern);
    if (match) {
      if (match[2] && ENGLISH_MONTHS[match[2].toLowerCase()] !== undefined) {
        const day = parseInt(match[1]);
        const month = ENGLISH_MONTHS[match[2].toLowerCase()];
        let year = parseInt(match[3]);
        if (year < 100) year += 2000;
        if (month < 0 || month > 11 || day < 1 || day > 31) return null;
        date = new Date(year, month, day);
      } else {
        let year = parseInt(match[3] || match[1]);
        let month = parseInt(match[2]);
        let day = parseInt(match[1]);

        if (match[1].length === 4) {
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        }

        if (year < 100) year += 2000;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;

        date = new Date(year, month - 1, day);
      }
      break;
    }
  }

  if (!date || isNaN(date.getTime())) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) date = d;
  }

  if (!date) return null;

  if (timeVal) {
    const timeStr = String(timeVal).trim();
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), parseInt(timeMatch[3] || 0));
    }
  }

  return date;
}

function parseSensorValue(value, sensorName) {
  if (value === null || value === undefined) {
    return { value: null, isValid: false, reason: 'missing' };
  }

  const strValue = String(value).trim();

  if (MISSING_VALUES.includes(strValue) || MISSING_VALUES.includes(value)) {
    return { value: null, isValid: false, reason: 'missing' };
  }

  let numericStr = strValue
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/°/g, '')
    .replace(/[cfCF]$/i, '')
    .replace(/\+/g, '');

  const num = parseFloat(numericStr);
  if (isNaN(num)) {
    return { value: null, isValid: false, reason: 'parse_error' };
  }

  const rounded = Math.round(num * 10) / 10;

  const isHumidity = /\b(hr|rh|hum|humedad)\b/i.test(String(sensorName || ''));
  const isAmbiente = /amb|room|aire/i.test(String(sensorName || ''));

  if (isHumidity) {
    if (rounded < 0 || rounded > 100) {
      return { value: rounded, isValid: false, reason: 'out_of_range' };
    }
    return { value: rounded, isValid: true, reason: null };
  }

  if (rounded < -10 || rounded > 30) {
    return { value: rounded, isValid: false, reason: 'out_of_range' };
  }

  return { value: rounded, isValid: true, reason: null };
}

function detectGaps(records) {
  const gaps = [];
  const MAX_GAP_MS = 60 * 60 * 1000 * 1.5;

  for (let i = 1; i < records.length; i++) {
    const diff = records[i].timestamp.getTime() - records[i - 1].timestamp.getTime();
    if (diff > MAX_GAP_MS) {
      gaps.push({
        start: records[i - 1].timestamp,
        end: records[i].timestamp,
        hours: Math.round(diff / (1000 * 60 * 60) * 10) / 10,
      });
    }
  }

  return gaps;
}

function extractMetadata(rows) {
  const metadata = {};
  const labelValueMap = [
    ['especie', 'especie'],
    ['cliente', 'cliente'],
    ['destino', 'destino'],
    ['zona', 'zona'],
    ['cámara', 'camara'],
    ['camara', 'camara'],
    ['planta', 'planta'],
    ['condición', 'condicion'],
    ['condicion', 'condicion'],
    ['inicio', 'inicio'],
    ['final', 'final'],
    ['duración', 'duracion'],
    ['duracion', 'duracion'],
    ['frecuencia min', 'frecuencia_min'],
    ['operador inicial', 'operador_inicial'],
    ['operador final', 'operador_final'],
    ['id proceso', 'id_proceso'],
  ];

  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i];
    if (!row) continue;
    for (let j = 0; j < row.length - 1; j++) {
      const cell = String(row[j] || '').toLowerCase().trim();
      if (!cell) continue;
      for (const [pattern, key] of labelValueMap) {
        if (cell === pattern || cell === pattern + ':') {
          const val = row[j + 1] ? String(row[j + 1]).trim() : null;
          if (val && !metadata[key]) metadata[key] = val;
        }
      }
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function computeSensorStats(records, sensorNames) {
  const stats = {};

  sensorNames.forEach(name => {
    let total = 0;
    let valid = 0;
    let nullCount = 0;

    records.forEach(record => {
      const sensor = record.sensors[name];
      if (sensor) {
        total++;
        if (sensor.isValid) valid++;
        else nullCount++;
      }
    });

    stats[name] = { total, valid, null: nullCount };
  });

  return stats;
}

export function getPreviewData(parsed, maxRows = 10) {
  return parsed.records.slice(0, maxRows).map(r => {
    const row = {
      fecha: r.timestamp.toLocaleDateString('es-CL'),
      hora: r.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    };
    Object.entries(r.sensors).forEach(([name, sensor]) => {
      row[name] = sensor.isValid ? `${sensor.value}°C` : '-';
    });
    return row;
  });
}
