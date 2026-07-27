import { parseExcelFile, getPreviewData } from '../engine/parser.js';
import { evaluate } from '../engine/evaluator.js';
import { requireAuth } from '../auth/authGuard.js';
import { navigateTo } from '../utils/router.js';
import { db } from '../config/firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  SAG_VARIETIES, SAG_COUNTRIES, SAG_FAMILIES,
  SDP_CATEGORIES, QUARANTINE_PESTS, TREATMENT_TYPES,
  findProtocolLocal,
} from '../config/sagData.js';

let currentState = {
  step: 1,
  metadata: {},
  parsedData: null,
  sensorConfig: [],
  protocol: null,
  result: null,
  file: null,
};

export function renderNewEvaluation(container) {
  requireAuth((user) => {
    currentState = { step: 1, metadata: {}, parsedData: null, sensorConfig: [], protocol: null, result: null, file: null };
    container.innerHTML = buildWizardHTML();
    attachWizardEvents(container, user);
  });
}

function buildWizardHTML() {
  return `
    <div class="min-h-screen bg-gray-50">
      <nav class="bg-white shadow-sm border-b">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center h-16 gap-4">
            <a href="#/" class="text-gray-500 hover:text-gray-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
            <span class="font-semibold">Nueva Evaluación</span>
          </div>
        </div>
      </nav>

      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Steps indicator -->
        <div class="flex items-center justify-center mb-8">
          <div class="flex items-center">
            <div id="step1Indicator" class="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm">1</div>
            <span class="ml-2 text-sm font-medium text-primary-600">Datos</span>
          </div>
          <div class="w-16 h-0.5 bg-gray-300 mx-4" id="line1"></div>
          <div class="flex items-center">
            <div id="step2Indicator" class="w-10 h-10 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center font-bold text-sm">2</div>
            <span class="ml-2 text-sm font-medium text-gray-500">Archivo</span>
          </div>
          <div class="w-16 h-0.5 bg-gray-300 mx-4" id="line2"></div>
          <div class="flex items-center">
            <div id="step3Indicator" class="w-10 h-10 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center font-bold text-sm">3</div>
            <span class="ml-2 text-sm font-medium text-gray-500">Resultado</span>
          </div>
        </div>

        <div id="stepContent" class="card">
        </div>
      </div>
    </div>
  `;
}

function attachWizardEvents(container, user) {
  renderStep1(container, user);
}

function renderStep1(container, user) {
  const stepContent = container.querySelector('#stepContent');
  updateIndicators(1);

  stepContent.innerHTML = `
    <h2 class="text-xl font-bold mb-6">Datos del Tratamiento</h2>
    <form id="step1Form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="label">Cámara</label>
        <input type="text" id="cameraName" class="input-field" placeholder="Ej: CA-05" required />
      </div>
      <div>
        <label class="label">Producto *</label>
        <select id="product" class="input-field" required>
          <option value="">Seleccionar...</option>
          ${Object.values(SAG_FAMILIES).flatMap(f => f.species).map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="label">Variedad *</label>
        <select id="variety" class="input-field" required disabled>
          <option value="">Seleccionar producto primero...</option>
        </select>
      </div>
      <div>
        <label class="label">País Destino *</label>
        <select id="destinationCountry" class="input-field" required>
          <option value="">Seleccionar...</option>
          ${SAG_COUNTRIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="label">Fecha Inicio Tratamiento *</label>
        <input type="date" id="startDate" class="input-field" required />
      </div>
      <div>
        <label class="label">Fecha Término Tratamiento *</label>
        <input type="date" id="endDate" class="input-field" required />
      </div>
      <div>
        <label class="label">Código de Lote</label>
        <input type="text" id="lotCode" class="input-field" placeholder="Ej: L-2026-001" />
      </div>
      <div>
        <label class="label">Tipo de Almacenamiento *</label>
        <select id="storageType" class="input-field" required>
          <option value="embalada">Fruta Embalada</option>
          <option value="bins">Bins</option>
        </select>
      </div>
      <div>
        <label class="label">Temperatura Objetivo (°C)</label>
        <input type="number" id="temperatureTarget" class="input-field" step="0.1" value="-0.5" placeholder="-0.5" />
      </div>
      <div>
        <label class="label">Tolerancia (± °C)</label>
        <input type="number" id="temperatureTolerance" class="input-field" step="0.1" value="0.5" placeholder="0.5" />
      </div>
      <div>
        <label class="label">Duración Requerida (días)</label>
        <input type="number" id="durationDays" class="input-field" value="42" placeholder="42" />
      </div>
      <div class="md:col-span-2">
        <label class="label">Observaciones</label>
        <textarea id="observations" class="input-field" rows="2" placeholder="Notas adicionales..."></textarea>
      </div>
      <div class="md:col-span-2 flex justify-end gap-3 mt-4">
        <a href="#/" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary">Siguiente: Cargar Archivo</button>
      </div>
    </form>
  `;

  const productSelect = container.querySelector('#product');
  const varietySelect = container.querySelector('#variety');

  productSelect.addEventListener('change', () => {
    const product = productSelect.value;
    const varieties = SAG_VARIETIES[product] || [];
    varietySelect.innerHTML = varieties.length
      ? `<option value="">Seleccionar...</option>${varieties.map(v => `<option value="${v}">${v}</option>`).join('')}`
      : '<option value="">No hay variedades</option>';
    varietySelect.disabled = varieties.length === 0;
  });

  container.querySelector('#step1Form').addEventListener('submit', (e) => {
    e.preventDefault();
    currentState.metadata = {
      cameraName: container.querySelector('#cameraName').value,
      product: container.querySelector('#product').value,
      variety: container.querySelector('#variety').value,
      destinationCountry: container.querySelector('#destinationCountry').value,
      startDate: container.querySelector('#startDate').value,
      endDate: container.querySelector('#endDate').value,
      lotCode: container.querySelector('#lotCode').value,
      storageType: container.querySelector('#storageType').value,
      temperatureTarget: parseFloat(container.querySelector('#temperatureTarget').value) || -0.5,
      temperatureTolerance: parseFloat(container.querySelector('#temperatureTolerance').value) || 0.5,
      durationDays: parseInt(container.querySelector('#durationDays').value) || 42,
      observations: container.querySelector('#observations').value,
    };
    currentState.step = 2;
    renderStep2(container, user);
  });
}

function renderStep2(container, user) {
  const stepContent = container.querySelector('#stepContent');
  updateIndicators(2);

  stepContent.innerHTML = `
    <h2 class="text-xl font-bold mb-6">Cargar Archivo de Registro</h2>
    <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-primary-400 transition-colors cursor-pointer">
      <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
      </svg>
      <p class="text-gray-600 font-medium">Arrastra el archivo Excel aquí</p>
      <p class="text-gray-400 text-sm mt-1">o haz clic para seleccionar</p>
      <input type="file" id="fileInput" class="hidden" accept=".xlsx,.xls,.csv" />
    </div>

    <div id="fileInfo" class="hidden mt-6">
      <div class="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
        <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <div>
          <p class="font-medium text-blue-800" id="fileName"></p>
          <p class="text-sm text-blue-600" id="fileStats"></p>
        </div>
        <button id="removeFile" class="ml-auto text-blue-400 hover:text-red-500">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div id="previewTable" class="hidden mt-6">
      <h3 class="font-semibold mb-3">Vista Previa (primeros registros)</h3>
      <div class="table-container max-h-64 overflow-y-auto border rounded-lg">
        <table class="data-table text-xs" id="previewContent">
        </table>
      </div>
    </div>

    <div id="parseError" class="hidden mt-4 p-4 bg-red-50 rounded-lg text-danger text-sm"></div>

    <div id="sensorConfigSection" class="hidden mt-6">
      <h3 class="font-semibold mb-3">Configuración de Sensores</h3>
      <p class="text-sm text-gray-500 mb-4">Asigna el rol de cada sensor detectado en el archivo. Los sensores marcados como "Excluido" no se usarán en la evaluación.</p>
      <div class="table-container border rounded-lg overflow-x-auto">
        <table class="data-table text-sm min-w-full">
          <thead>
            <tr>
              <th class="px-4 py-3 text-left">Sensor</th>
              <th class="px-4 py-3 text-left">Rol</th>
              <th class="px-4 py-3 text-left">Nombre Custom</th>
              <th class="px-4 py-3 text-left">Muestra (primer valor)</th>
              <th class="px-4 py-3 text-left">Promedio</th>
            </tr>
          </thead>
          <tbody id="sensorConfigBody">
          </tbody>
        </table>
      </div>
    </div>

    <div class="flex justify-between mt-8">
      <button id="backBtn" class="btn-secondary">Volver</button>
      <button id="evaluateBtn" class="btn-primary" disabled>Evaluar Tratamiento</button>
    </div>
  `;

  const dropZone = container.querySelector('#dropZone');
  const fileInput = container.querySelector('#fileInput');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-primary-400', 'bg-primary-50');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-primary-400', 'bg-primary-50');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-primary-400', 'bg-primary-50');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0], container);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFile(e.target.files[0], container);
    }
  });

  container.querySelector('#backBtn').addEventListener('click', () => {
    currentState.step = 1;
    renderStep1(container, user);
  });

  container.querySelector('#removeFile')?.addEventListener('click', () => {
    currentState.parsedData = null;
    currentState.file = null;
    container.querySelector('#fileInfo').classList.add('hidden');
    container.querySelector('#previewTable').classList.add('hidden');
    container.querySelector('#evaluateBtn').disabled = true;
    container.querySelector('#dropZone').classList.remove('hidden');
  });

  container.querySelector('#evaluateBtn').addEventListener('click', () => {
    performEvaluation(container, user);
  });
}

async function handleFile(file, container) {
  const dropZone = container.querySelector('#dropZone');
  const fileInfo = container.querySelector('#fileInfo');
  const parseError = container.querySelector('#parseError');
  const evaluateBtn = container.querySelector('#evaluateBtn');

  parseError.classList.add('hidden');
  dropZone.classList.add('hidden');

  try {
    currentState.file = file;
    currentState.parsedData = await parseExcelFile(file);

    container.querySelector('#fileName').textContent = file.name;
    container.querySelector('#fileStats').textContent =
      `${currentState.parsedData.stats.totalRecords} registros | ${currentState.parsedData.sensorNames.length} sensores | ${currentState.parsedData.stats.gaps.length} gaps detectados`;

    fileInfo.classList.remove('hidden');
    evaluateBtn.disabled = false;

    const preview = getPreviewData(currentState.parsedData);
    const headers = Object.keys(preview[0] || {});
    const previewContent = container.querySelector('#previewContent');

    previewContent.innerHTML = `
      <thead>
        <tr>${headers.map(h => `<th class="px-3 py-2 text-left bg-gray-50 font-medium">${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${preview.map(row => `
          <tr>${headers.map(h => `<td class="px-3 py-1 border-t">${row[h]}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    `;

    container.querySelector('#previewTable').classList.remove('hidden');
    showSensorConfig(container, currentState.parsedData);
  } catch (error) {
    parseError.textContent = error.message;
    parseError.classList.remove('hidden');
    dropZone.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    evaluateBtn.disabled = true;
  }
}

function showSensorConfig(container, parsedData) {
  const section = container.querySelector('#sensorConfigSection');
  const tbody = container.querySelector('#sensorConfigBody');
  section.classList.remove('hidden');

  currentState.sensorConfig = parsedData.sensorNames.map((name, idx) => {
    const isHumidity = /hr|rh|hum|humedad/i.test(name);
    const defaultRole = isHumidity ? 'ambiente' : 'pulpa';
    return {
      originalName: name,
      role: defaultRole,
      customName: name,
      index: idx,
    };
  });

  tbody.innerHTML = currentState.sensorConfig.map((sensor, idx) => {
    const stats = parsedData.stats.sensorStats[sensor.originalName];
    const sampleRecord = parsedData.records.find(r => r.sensors[sensor.originalName]?.isValid);
    const sampleValue = sampleRecord ? sampleRecord.sensors[sensor.originalName].value : '-';
    const avg = stats && stats.valid > 0
      ? (parsedData.records.reduce((sum, r) => {
          const s = r.sensors[sensor.originalName];
          return s && s.isValid ? sum + s.value : sum;
        }, 0) / stats.valid).toFixed(1)
      : '-';

    return `
      <tr class="${sensor.role === 'excluido' ? 'bg-gray-50 opacity-60' : ''}" data-sensor-idx="${idx}">
        <td class="px-4 py-3 font-medium">
          ${sensor.originalName}
          <span class="text-xs text-gray-400 block">${stats ? stats.valid + ' registros válidos' : ''}</span>
        </td>
        <td class="px-4 py-3">
          <select class="input-field text-sm sensor-role-select" data-idx="${idx}">
            <option value="pulpa" ${sensor.role === 'pulpa' ? 'selected' : ''}>Pulpa</option>
            <option value="ambiente" ${sensor.role === 'ambiente' ? 'selected' : ''}>Ambiente</option>
            <option value="excluido" ${sensor.role === 'excluido' ? 'selected' : ''}>Excluido</option>
          </select>
        </td>
        <td class="px-4 py-3">
          <input type="text" class="input-field text-sm sensor-custom-name" data-idx="${idx}" value="${sensor.customName}" placeholder="Nombre personalizado" />
        </td>
        <td class="px-4 py-3 text-gray-600">${sampleValue}${sampleValue !== '-' ? '°C' : ''}</td>
        <td class="px-4 py-3 text-gray-600">${avg}${avg !== '-' ? '°C' : ''}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.sensor-role-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.idx);
      currentState.sensorConfig[idx].role = sel.value;
      const row = sel.closest('tr');
      if (sel.value === 'excluido') {
        row.classList.add('bg-gray-50', 'opacity-60');
      } else {
        row.classList.remove('bg-gray-50', 'opacity-60');
      }
    });
  });

  tbody.querySelectorAll('.sensor-custom-name').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.idx);
      currentState.sensorConfig[idx].customName = input.value;
    });
  });
}

function performEvaluation(container, user) {
  if (currentState.sensorConfig.length === 0) {
    alert('Primero carga un archivo y configura los sensores.');
    return;
  }

  const pulpaSensors = currentState.sensorConfig.filter(s => s.role === 'pulpa');
  if (pulpaSensors.length === 0) {
    alert('Debe haber al menos un sensor configurado como "Pulpa".');
    return;
  }

  currentState.metadata.sensorConfig = currentState.sensorConfig;
  const meta = currentState.metadata;
  const matchProtocol = findProtocolLocal(meta.product, meta.variety, meta.destinationCountry);

  if (!matchProtocol) {
    const stepContent = container.querySelector('#stepContent');
    stepContent.innerHTML = `
      <div class="text-center py-12">
        <div class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Protocolo No Encontrado</h3>
        <p class="text-gray-500 mb-6">No existe un protocolo configurado para:<br/>
          <strong>${meta.product} - ${meta.variety} - ${meta.destinationCountry}</strong>
        </p>
        <p class="text-sm text-gray-400 mb-6">Configure el protocolo en Admin → Protocolos</p>
        <div class="flex justify-center gap-3">
          <a href="#/admin/protocolos-sag" class="btn-primary">Configurar Protocolo</a>
          <a href="#/" class="btn-secondary">Volver al Dashboard</a>
        </div>
      </div>
    `;
    return;
  }

  currentState.protocol = matchProtocol;
  currentState.result = evaluate(currentState.parsedData, matchProtocol, currentState.metadata);

  renderStep3(container, user);
}

function renderStep3(container, user) {
  const stepContent = container.querySelector('#stepContent');
  updateIndicators(3);

  const result = currentState.result;
  const meta = currentState.metadata;
  const protocol = currentState.protocol;
  const isApproved = result.status === 'aprobado';

  stepContent.innerHTML = `
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-full ${isApproved ? 'bg-green-100' : 'bg-red-100'} mb-4">
        ${isApproved
          ? '<svg class="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
          : '<svg class="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
        }
      </div>
      <h2 class="text-2xl font-bold ${isApproved ? 'text-green-700' : 'text-red-700'}">
        ${isApproved ? 'APROBADO' : 'NO APROBADO'}
      </h2>
      <p class="text-gray-500 mt-1">${result.summary}</p>
    </div>

    <!-- Treatment Info -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
      <div class="bg-gray-50 p-3 rounded-lg">
        <span class="text-gray-500 block">Cámara</span>
        <span class="font-semibold">${meta.cameraName}</span>
      </div>
      <div class="bg-gray-50 p-3 rounded-lg">
        <span class="text-gray-500 block">Producto</span>
        <span class="font-semibold">${meta.product} ${meta.variety}</span>
      </div>
      <div class="bg-gray-50 p-3 rounded-lg">
        <span class="text-gray-500 block">Destino</span>
        <span class="font-semibold">${meta.destinationCountry}</span>
      </div>
      <div class="bg-gray-50 p-3 rounded-lg">
        <span class="text-gray-500 block">Protocolo</span>
        <span class="font-semibold">${protocol.pais || '-'} · SDP ${protocol.categoria_SDP || '-'}</span>
      </div>
    </div>

    <!-- Validations -->
    <h3 class="font-semibold mb-3">Validaciones</h3>
    <div class="space-y-3 mb-6">
      ${result.validations.map(v => `
          <div class="flex items-start gap-3 p-3 rounded-lg ${v.status === 'cumple' ? 'bg-green-50' : v.status === 'no_cumple' ? 'bg-red-50' : v.status === 'info' ? 'bg-blue-50' : 'bg-yellow-50'}">
          <div class="flex-shrink-0 mt-0.5">
            ${v.status === 'cumple'
              ? '<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
              : v.status === 'info'
              ? '<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
              : '<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
            }
          </div>
          <div>
            <span class="font-medium ${v.status === 'cumple' ? 'text-green-800' : v.status === 'info' ? 'text-blue-800' : 'text-red-800'}">${v.name}</span>
            <p class="text-sm ${v.status === 'cumple' ? 'text-green-600' : v.status === 'info' ? 'text-blue-600' : 'text-red-600'}">${v.detail}</p>
          </div>
        </div>
      `).join('')}
    </div>

    ${result.deviations && result.deviations.length > 0 ? `
      <h3 class="font-semibold mb-3 text-red-700">Desviaciones Detectadas</h3>
      <div class="table-container mb-6">
        <table class="data-table text-sm">
          <thead>
            <tr>
              <th>Sensor</th>
              <th>Fecha/Hora</th>
              <th>Temperatura</th>
              <th>Máx Permitida</th>
            </tr>
          </thead>
          <tbody>
            ${result.deviations.slice(0, 20).map(d => `
              <tr>
                <td>${d.sensor}</td>
                <td>${d.timestamp.toLocaleString('es-CL')}</td>
                <td class="text-red-600 font-medium">${d.value}°C</td>
                <td>${d.maxAllowed}°C</td>
              </tr>
            `).join('')}
            ${result.deviations.length > 20 ? `<tr><td colspan="4" class="text-center text-gray-400">... y ${result.deviations.length - 20} más</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    ` : ''}

    <!-- Actions -->
    <div class="flex justify-between mt-8">
      <button id="saveAndBack" class="btn-secondary">Guardar y Volver</button>
      <button id="downloadReport" class="btn-primary">Descargar Informe</button>
    </div>
  `;

  container.querySelector('#saveAndBack').addEventListener('click', async () => {
    await saveEvaluation(user);
    navigateTo('/');
  });

  container.querySelector('#downloadReport').addEventListener('click', async () => {
    await saveEvaluation(user);
    generatePDFReport();
  });
}

async function saveEvaluation(user) {
  try {
    await addDoc(collection(db, 'evaluations'), {
      userId: user.uid,
      userEmail: user.email,
      data: {
        metadata: currentState.metadata,
        sensorConfig: currentState.sensorConfig,
        parsedStats: currentState.parsedData.stats,
      },
      protocol: {
        id: currentState.protocol.id || null,
        producto: currentState.protocol.producto,
        pais: currentState.protocol.pais,
        familia: currentState.protocol.familia || null,
        organismo_destino: currentState.protocol.organismo_destino || null,
        categoria_SDP: currentState.protocol.categoria_SDP || 'B',
        objetivo: currentState.protocol.objetivo || null,
        descripcion_protocolo: currentState.protocol.descripcion_protocolo || [],
        requisitos: currentState.protocol.requisitos || [],
        documentacion: currentState.protocol.documentacion || [],
        checklist_exportacion: currentState.protocol.checklist_exportacion || [],
        observaciones: currentState.protocol.observaciones || null,
      },
      result: currentState.result,
      createdAt: serverTimestamp(),
      status: 'completada',
    });
  } catch (error) {
    console.error('Error saving evaluation:', error);
  }
}

async function generatePDFReport() {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF();
  const result = currentState.result;
  const meta = currentState.metadata;
  const protocol = currentState.protocol;
  const isApproved = result.status === 'aprobado';

  doc.setFontSize(16);
  doc.text('EVALUACION DE TRATAMIENTO DE FRIO', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Programa Origen - SAG', 105, 27, { align: 'center' });

  doc.setDrawColor(200);
  doc.line(20, 30, 190, 30);

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Datos del Tratamiento', 20, 40);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);

  const treatmentData = [
    ['Camara:', meta.cameraName],
    ['Producto:', `${meta.product} - ${meta.variety}`],
    ['Pais Destino:', meta.destinationCountry],
    ['Fecha Inicio:', meta.startDate],
    ['Fecha Termino:', meta.endDate],
    ['Codigo Lote:', meta.lotCode || '-'],
    ['Tipo Almacenamiento:', meta.storageType === 'bins' ? 'Bins' : 'Embalada'],
  ];

  if (protocol.categoria_SDP) {
    treatmentData.push(['Categoria SDP:', protocol.categoria_SDP]);
  }
  if (protocol.pais) {
    treatmentData.push(['Pais Protocolo:', protocol.pais]);
  }
  if (protocol.organismo_destino) {
    treatmentData.push(['Organismo:', protocol.organismo_destino]);
  }
  if (protocol.objetivo) {
    treatmentData.push(['Objetivo:', protocol.objetivo]);
  }
  if (protocol.observaciones) {
    treatmentData.push(['Observaciones:', protocol.observaciones]);
  }

  const sensorConfig = currentState.sensorConfig || [];
  if (sensorConfig.length > 0) {
    const pulpaNames = sensorConfig.filter(s => s.role === 'pulpa').map(s => s.customName || s.originalName);
    const ambNames = sensorConfig.filter(s => s.role === 'ambiente').map(s => s.customName || s.originalName);
    const exclNames = sensorConfig.filter(s => s.role === 'excluido').map(s => s.customName || s.originalName);
    if (pulpaNames.length) treatmentData.push(['Sensores Pulpa:', pulpaNames.join(', ')]);
    if (ambNames.length) treatmentData.push(['Sensores Ambiente:', ambNames.join(', ')]);
    if (exclNames.length) treatmentData.push(['Sensores Excluidos:', exclNames.join(', ')]);
  }

  let y = 48;
  treatmentData.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 20, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(value), 60, y);
    y += 6;
  });

  y += 5;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('Protocolo Aplicado', 20, y);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  y += 8;
  doc.text(`Pais Destino: ${protocol.pais || '-'}`, 20, y);
  y += 6;
  doc.text(`Categoria SDP: ${protocol.categoria_SDP || '-'}`, 20, y);
  y += 6;
  if (protocol.requisitos?.length) {
    doc.text(`Requisitos: ${protocol.requisitos.length} requisito(s)`, 20, y);
    y += 6;
  }

  y += 10;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(14);
  const resultText = isApproved ? 'APROBADO' : 'NO APROBADO';
  doc.setTextColor(isApproved ? 0 : 220, isApproved ? 150 : 0, 0);
  doc.text(`Resultado: ${resultText}`, 105, y, { align: 'center' });
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(result.summary, 105, y + 7, { align: 'center' });

  y += 18;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('Validaciones', 20, y);
  y += 8;

  const validationRows = result.validations.map(v => [
    v.name,
    v.status === 'cumple' ? 'CUMPLE' : 'NO CUMPLE',
    v.detail,
  ]);

  doc.autoTable({
    startY: y,
    head: [['Validacion', 'Estado', 'Detalle']],
    body: validationRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: {
      1: { cellWidth: 25 },
    },
  });

  if (result.deviations && result.deviations.length > 0) {
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Desviaciones Detectadas', 20, finalY);

    const devRows = result.deviations.slice(0, 20).map(d => [
      d.sensor,
      d.timestamp.toLocaleString('es-CL'),
      `${d.value}°C`,
      `${d.maxAllowed}°C`,
    ]);

    doc.autoTable({
      startY: finalY + 5,
      head: [['Sensor', 'Fecha/Hora', 'Temperatura', 'Max Permitida']],
      body: devRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [220, 0, 0] },
    });
  }

  doc.save(`evaluacion-${meta.cameraName}-${meta.startDate}.pdf`);
}

function updateIndicators(step) {
  for (let i = 1; i <= 3; i++) {
    const indicator = document.getElementById(`step${i}Indicator`);
    if (!indicator) continue;

    if (i <= step) {
      indicator.className = 'w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm';
    } else {
      indicator.className = 'w-10 h-10 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center font-bold text-sm';
    }
  }
}
