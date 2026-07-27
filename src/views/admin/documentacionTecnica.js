import { requireAuth } from '../../auth/authGuard.js';
import { detectFileType, convertFile, downloadBlob } from '../../engine/converter.js';

export function renderDocumentacionTecnica(container) {
  requireAuth(async () => {
    container.innerHTML = buildHTML();
    attachEvents(container);
  });
}

function buildHTML() {
  return `
    <div class="min-h-screen bg-gray-50">
      <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
              </div>
              <span class="font-bold text-gray-800">EvalFríoSAG</span>
            </div>
            <div class="flex items-center gap-4">
              <a href="#/admin/protocolos-sag" class="text-sm text-gray-500 hover:text-primary-600">Protocolos SAG</a>
              <a href="#/" class="text-sm text-gray-500 hover:text-primary-600">Dashboard</a>
            </div>
          </div>
        </div>
      </nav>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="mb-8">
          <h1 class="text-2xl font-bold text-gray-900">Documentación Técnica</h1>
          <p class="text-gray-500 mt-1">Cargar, convertir y revisar documentos técnicos de tratamiento</p>
        </div>

        <!-- Upload Zone -->
        <div id="uploadZone" class="card border-2 border-dashed border-gray-300 hover:border-primary-400 transition-colors cursor-pointer mb-8">
          <div class="flex flex-col items-center justify-center py-12">
            <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <p class="text-lg font-medium text-gray-700 mb-2">Arrastra un archivo aquí o haz clic para seleccionar</p>
            <p class="text-sm text-gray-400 mb-4">Formatos soportados: .xls, .xlsx, .csv, .doc, .docx, .pdf</p>
            <div class="flex flex-wrap gap-2 justify-center">
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Excel</span>
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Word</span>
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">PDF</span>
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">CSV</span>
            </div>
            <input type="file" id="fileInput" class="hidden" accept=".xls,.xlsx,.csv,.doc,.docx,.pdf">
          </div>
        </div>

        <!-- Progress -->
        <div id="progressSection" class="hidden card mb-8">
          <div class="flex items-center gap-4 mb-3">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            <span id="progressMessage" class="text-gray-700"></span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div id="progressBar" class="bg-primary-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
        </div>

        <!-- Result -->
        <div id="resultSection" class="hidden">
          <!-- File Info Card -->
          <div class="card mb-6">
            <h2 class="text-lg font-semibold mb-4">Resultado de Conversión</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="bg-gray-50 rounded-lg p-4">
                <h3 class="text-sm font-medium text-gray-500 mb-2">Archivo Original</h3>
                <p class="font-medium text-gray-900" id="originalName"></p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700" id="originalFormat"></span>
                  <span class="text-sm text-gray-500" id="originalSize"></span>
                </div>
              </div>
              <div class="bg-green-50 rounded-lg p-4">
                <h3 class="text-sm font-medium text-gray-500 mb-2">Archivo Convertido</h3>
                <p class="font-medium text-gray-900" id="convertedName"></p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-200 text-green-700" id="convertedFormat"></span>
                  <span class="text-sm text-gray-500" id="convertedSize"></span>
                </div>
              </div>
            </div>

            <div id="conversionStats" class="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700"></div>

            <div class="flex gap-3 mt-6">
              <button id="downloadConvertedBtn" class="btn-primary flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Descargar Convertido (.xlsx)
              </button>
              <button id="downloadOriginalBtn" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Descargar Original
              </button>
              <button id="newFileBtn" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Cargar otro archivo
              </button>
            </div>
          </div>

          <!-- Preview Section -->
          <div class="card">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold">Vista Previa</h2>
              <span class="text-sm text-gray-400" id="previewInfo"></span>
            </div>
            <div id="previewContent" class="overflow-auto max-h-[600px]"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachEvents(container) {
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const progressSection = document.getElementById('progressSection');
  const progressBar = document.getElementById('progressBar');
  const progressMessage = document.getElementById('progressMessage');
  const resultSection = document.getElementById('resultSection');

  let currentResult = null;
  let currentFile = null;

  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('border-primary-500', 'bg-primary-50');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('border-primary-500', 'bg-primary-50');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('border-primary-500', 'bg-primary-50');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  async function handleFile(file) {
    const typeInfo = detectFileType(file);
    if (!typeInfo.supported) {
      alert(`Formato no soportado: .${typeInfo.ext}\n\nFormatos permitidos: .xls, .xlsx, .csv, .doc, .docx, .pdf`);
      return;
    }

    currentFile = file;
    uploadZone.classList.add('hidden');
    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');

    try {
      currentResult = await convertFile(file, (progress) => {
        progressBar.style.width = `${progress.percent}%`;
        progressMessage.textContent = progress.message;
      });

      showResult(currentResult, file);
    } catch (error) {
      alert(`Error al convertir: ${error.message}`);
      uploadZone.classList.remove('hidden');
      progressSection.classList.add('hidden');
    }
  }

  function showResult(result, originalFile) {
    progressSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    document.getElementById('originalName').textContent = result.originalName;
    document.getElementById('originalFormat').textContent = result.originalType.label;
    document.getElementById('originalSize').textContent = formatSize(originalFile.size);

    document.getElementById('convertedName').textContent = result.convertedName;
    document.getElementById('convertedFormat').textContent = `.${result.convertedFormat}`;
    const convSize = result.convertedBlob.size;
    document.getElementById('convertedSize').textContent = formatSize(convSize);

    const stats = buildStatsText(result);
    document.getElementById('conversionStats').textContent = stats;

    renderPreview(result.preview);

    document.getElementById('downloadConvertedBtn').addEventListener('click', () => {
      downloadBlob(result.convertedBlob, result.convertedName);
    });

    document.getElementById('downloadOriginalBtn').addEventListener('click', () => {
      downloadBlob(originalFile, result.originalName);
    });

    document.getElementById('newFileBtn').addEventListener('click', () => {
      uploadZone.classList.remove('hidden');
      resultSection.classList.add('hidden');
      fileInput.value = '';
    });
  }

  function renderPreview(preview) {
    const el = document.getElementById('previewContent');
    const info = document.getElementById('previewInfo');

    if (!preview) {
      el.innerHTML = '<p class="text-gray-400 text-center py-8">Sin vista previa disponible</p>';
      return;
    }

    if (preview.type === 'excel') {
      const sheetNames = preview.sheetNames;
      info.textContent = `${sheetNames.length} hoja(s)`;

      let html = '';
      if (sheetNames.length > 1) {
        html += '<div class="flex gap-2 mb-4 flex-wrap">';
        sheetNames.forEach((name, i) => {
          html += `<button class="sheet-tab px-3 py-1 rounded-lg text-sm font-medium ${i === 0 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" data-sheet="${name}">${escapeHtml(name)}</button>`;
        });
        html += '</div>';
      }

      sheetNames.forEach((name, i) => {
        const sheet = preview.sheets[name];
        const isVisible = i === 0 ? '' : 'hidden';
        html += `<div class="sheet-content ${isVisible}" data-sheet="${name}">`;
        html += `<p class="text-sm text-gray-500 mb-2">${sheet.totalRows} fila(s) de datos</p>`;
        html += renderTable(sheet.headers, sheet.rows);
        if (sheet.totalRows > 50) {
          html += `<p class="text-sm text-gray-400 mt-2 text-center">Mostrando primeras 50 de ${sheet.totalRows} filas</p>`;
        }
        html += '</div>';
      });

      el.innerHTML = html;

      el.querySelectorAll('.sheet-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          el.querySelectorAll('.sheet-tab').forEach(t => {
            t.classList.remove('bg-primary-600', 'text-white');
            t.classList.add('bg-gray-100', 'text-gray-600');
          });
          tab.classList.add('bg-primary-600', 'text-white');
          tab.classList.remove('bg-gray-100', 'text-gray-600');

          el.querySelectorAll('.sheet-content').forEach(c => c.classList.add('hidden'));
          el.querySelector(`.sheet-content[data-sheet="${tab.dataset.sheet}"]`).classList.remove('hidden');
        });
      });

    } else if (preview.type === 'text') {
      info.textContent = `${preview.lines.length} líneas extraídas`;
      el.innerHTML = `<pre class="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg">${escapeHtml(preview.text).substring(0, 10000)}</pre>`;

    } else if (preview.type === 'html') {
      info.textContent = `${preview.textLines.length} líneas extraídas`;
      el.innerHTML = `
        <div class="prose prose-sm max-w-none bg-gray-50 p-4 rounded-lg overflow-auto max-h-[500px]">${preview.html}</div>
      `;
    }
  }

  function renderTable(headers, rows) {
    let html = '<div class="overflow-x-auto"><table class="min-w-full text-sm"><thead><tr class="bg-gray-50">';
    headers.forEach(h => {
      html += `<th class="px-3 py-2 text-left font-medium text-gray-600 border-b">${escapeHtml(h)}</th>`;
    });
    html += '</tr></thead><tbody>';
    rows.forEach((row, ri) => {
      const cls = ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
      html += `<tr class="${cls}">`;
      row.forEach(cell => {
        html += `<td class="px-3 py-1.5 border-b border-gray-100 text-gray-700">${escapeHtml(cell)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }
}

function buildStatsText(result) {
  const parts = [];
  if (result.stats?.sheets) parts.push(`${result.stats.sheets} hoja(s)`);
  if (result.stats?.totalRows) parts.push(`${result.stats.totalRows} filas totales`);
  if (result.stats?.sheetNames) parts.push(`Hojas: ${result.stats.sheetNames.join(', ')}`);
  if (result.stats?.pages) parts.push(`${result.stats.pages} página(s) PDF`);
  if (result.stats?.totalLines) parts.push(`${result.stats.totalLines} líneas de texto`);
  if (result.stats?.type === 'word') parts.push('Contenido extraído del documento Word');
  return parts.join(' · ') || 'Conversión completada';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
