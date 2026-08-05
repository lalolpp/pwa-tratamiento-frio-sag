import { parseExcelFile, getPreviewData } from '../engine/parser.js';
import { evaluate } from '../engine/evaluator.js';
import { requireAuth } from '../auth/authGuard.js';
import { navigateTo } from '../utils/router.js';
import { saveEvaluation } from '../services/offlineService.js';
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

let unsubscribeAuth = null;

export function renderNewEvaluation(container) {
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }
  unsubscribeAuth = requireAuth((user) => {
    currentState = { step: 1, metadata: {}, parsedData: null, sensorConfig: [], protocol: null, result: null, file: null };
    container.innerHTML = buildWizardHTML();
    attachWizardEvents(container, user);
  });
}

function buildWizardHTML() {
  return `
    <div class="min-h-screen">
      <nav class="glass-nav sticky top-0 z-50">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center h-16 gap-4">
            <a href="#/" class="text-white/50 hover:text-white/80 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
            <span class="font-semibold text-white">Nueva Evaluación</span>
          </div>
        </div>
      </nav>

      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Steps indicator -->
        <div class="flex items-center justify-center mb-8 fade-in-up">
          <div class="flex items-center">
            <div id="step1Indicator" class="step-active">1</div>
            <span class="ml-2 text-sm font-medium text-white">Datos</span>
          </div>
          <div class="step-line mx-4" id="line1"></div>
          <div class="flex items-center">
            <div id="step2Indicator" class="step-inactive">2</div>
            <span class="ml-2 text-sm font-medium text-white/40">Archivo</span>
          </div>
          <div class="step-line mx-4" id="line2"></div>
          <div class="flex items-center">
            <div id="step3Indicator" class="step-inactive">3</div>
            <span class="ml-2 text-sm font-medium text-white/40">Resultado</span>
          </div>
        </div>

        <div id="stepContent" class="glass-card-static fade-in-up">
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
    <h2 class="text-xl font-bold mb-6 text-white">Datos del Tratamiento</h2>
    <form id="step1Form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="label">Cámara</label>
        <input type="text" id="cameraName" class="glass-input" placeholder="Ej: CA-05" required />
      </div>
      <div>
        <label class="label">Producto *</label>
        <select id="product" class="glass-input" required>
          <option value="">Seleccionar...</option>
          ${Object.values(SAG_FAMILIES).flatMap(f => f.species).map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="label">Variedad *</label>
        <select id="variety" class="glass-input" required disabled>
          <option value="">Seleccionar producto primero...</option>
        </select>
      </div>
      <div>
        <label class="label">País Destino *</label>
        <select id="destinationCountry" class="glass-input" required>
          <option value="">Seleccionar...</option>
          ${SAG_COUNTRIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="label">Fecha Inicio Tratamiento *</label>
        <input type="date" id="startDate" class="glass-input" required />
      </div>
      <div>
        <label class="label">Fecha Término Tratamiento *</label>
        <input type="date" id="endDate" class="glass-input" required />
      </div>
      <div>
        <label class="label">Código de Lote</label>
        <input type="text" id="lotCode" class="glass-input" placeholder="Ej: L-2026-001" />
      </div>
      <div>
        <label class="label">Tipo de Almacenamiento *</label>
        <select id="storageType" class="glass-input" required>
          <option value="embalada">Fruta Embalada</option>
          <option value="bins">Bins</option>
        </select>
      </div>
      <div>
        <label class="label">Temperatura Mínima (°C) <span class="text-xs text-white/40">(ref.)</span></label>
        <input type="number" id="temperatureMin" class="glass-input" step="0.1" value="-1.5" placeholder="-1.5" />
      </div>
      <div>
        <label class="label">Temperatura Requerida (°C)</label>
        <input type="number" id="temperatureTarget" class="glass-input" step="0.1" value="-0.5" placeholder="-0.5" />
      </div>
      <div>
        <label class="label">Temperatura Máxima (°C)</label>
        <input type="number" id="temperatureMax" class="glass-input" step="0.1" value="0.5" placeholder="0.5" />
      </div>
      <div>
        <label class="label">Duración Requerida (días)</label>
        <input type="number" id="durationDays" class="glass-input" value="42" placeholder="42" />
      </div>
      <div class="md:col-span-2 border-t border-white/10 pt-4 mt-2">
        <div class="flex items-center gap-3 mb-3">
          <input type="checkbox" id="energyRestriction" class="w-4 h-4 rounded" style="accent-color: #3b82f6;" />
          <label for="energyRestriction" class="font-medium text-white/80">Régimen horario de invierno (restricción energética)</label>
        </div>
        <div id="energyRestrictionConfig" class="hidden ml-7 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="label text-xs">Hora Inicio Restricción</label>
            <input type="time" id="restrictionStart" class="glass-input" value="17:45" />
          </div>
          <div>
            <label class="label text-xs">Hora Término Restricción</label>
            <input type="time" id="restrictionEnd" class="glass-input" value="23:30" />
          </div>
          <div>
            <label class="label text-xs">Máx. Desviación Durante Restricción (°C)</label>
            <input type="number" id="restrictionMaxTemp" class="glass-input" step="0.1" value="5.0" placeholder="5.0" />
          </div>
          <div>
            <label class="label text-xs">Recuperación Esperada (min)</label>
            <input type="number" id="restrictionRecoveryMin" class="glass-input" value="60" placeholder="60" />
          </div>
        </div>
        <p class="text-xs text-white/30 ml-7 mt-1">Durante la restricción se detienen los sistemas trifásicos. Se permite subida de temperatura controlada.</p>
      </div>
      <div class="md:col-span-2">
        <label class="label">Observaciones</label>
        <textarea id="observations" class="glass-input" rows="2" placeholder="Notas adicionales..."></textarea>
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
    const energyRestriction = container.querySelector('#energyRestriction').checked;
    currentState.metadata = {
      cameraName: container.querySelector('#cameraName').value,
      product: container.querySelector('#product').value,
      variety: container.querySelector('#variety').value,
      destinationCountry: container.querySelector('#destinationCountry').value,
      startDate: container.querySelector('#startDate').value,
      endDate: container.querySelector('#endDate').value,
      lotCode: container.querySelector('#lotCode').value,
      storageType: container.querySelector('#storageType').value,
      temperatureMin: container.querySelector('#temperatureMin').value !== '' ? parseFloat(container.querySelector('#temperatureMin').value) : -1.5,
      temperatureTarget: container.querySelector('#temperatureTarget').value !== '' ? parseFloat(container.querySelector('#temperatureTarget').value) : -0.5,
      temperatureMax: container.querySelector('#temperatureMax').value !== '' ? parseFloat(container.querySelector('#temperatureMax').value) : 0.5,
      durationDays: container.querySelector('#durationDays').value !== '' ? parseInt(container.querySelector('#durationDays').value) : 42,
      observations: container.querySelector('#observations').value,
      energyRestriction,
      restrictionStart: container.querySelector('#restrictionStart').value || '17:45',
      restrictionEnd: container.querySelector('#restrictionEnd').value || '23:30',
      restrictionMaxTemp: parseFloat(container.querySelector('#restrictionMaxTemp').value) || 5.0,
      restrictionRecoveryMin: parseInt(container.querySelector('#restrictionRecoveryMin').value) || 60,
    };
    currentState.step = 2;
    renderStep2(container, user);
  });

  const energyToggle = container.querySelector('#energyRestriction');
  const energyConfig = container.querySelector('#energyRestrictionConfig');
  energyToggle.addEventListener('change', () => {
    energyConfig.classList.toggle('hidden', !energyToggle.checked);
  });
}

function renderStep2(container, user) {
  const stepContent = container.querySelector('#stepContent');
  updateIndicators(2);

  stepContent.innerHTML = `
    <h2 class="text-xl font-bold mb-6 text-white">Cargar Archivo de Registro</h2>
    <div id="dropZone" class="rounded-xl p-12 text-center cursor-pointer transition-all duration-300 hover:scale-[1.01]" style="border: 2px dashed rgba(255,255,255,0.15); background: rgba(255,255,255,0.03);">
      <svg class="w-12 h-12 text-white/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
      </svg>
      <p class="text-white/70 font-medium">Arrastra el archivo Excel aquí</p>
      <p class="text-white/40 text-sm mt-1">o haz clic para seleccionar</p>
      <input type="file" id="fileInput" class="hidden" accept=".xlsx,.xls,.csv" />
    </div>

    <div id="fileInfo" class="hidden mt-6">
      <div class="flex items-center gap-3 p-4 rounded-xl" style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2);">
        <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <div>
          <p class="font-medium text-blue-300" id="fileName"></p>
          <p class="text-sm text-blue-400/70" id="fileStats"></p>
        </div>
        <button id="removeFile" class="ml-auto text-white/30 hover:text-red-400 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div id="previewTable" class="hidden mt-6">
      <h3 class="font-semibold mb-3 text-white">Vista Previa (primeros registros)</h3>
      <div class="table-container max-h-64 overflow-y-auto rounded-xl" style="border: 1px solid rgba(255,255,255,0.08);">
        <table class="data-table text-xs" id="previewContent">
        </table>
      </div>
    </div>

    <div id="parseError" class="hidden mt-4 p-4 rounded-xl text-sm" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171;"></div>

    <div id="sensorConfigSection" class="hidden mt-6">
      <h3 class="font-semibold mb-3 text-white">Configuración de Sensores</h3>
      <p class="text-sm text-white/50 mb-4">Asigna el rol de cada sensor detectado en el archivo. Los sensores marcados como "Excluido" no se usarán en la evaluación.</p>
      <div class="rounded-xl overflow-x-auto" style="border: 1px solid rgba(255,255,255,0.08);">
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
    dropZone.style.borderColor = 'rgba(96,165,250,0.5)';
    dropZone.style.background = 'rgba(59,130,246,0.08)';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '';
    dropZone.style.background = '';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.background = '';
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
      <tr class="${sensor.role === 'excluido' ? 'opacity-40' : ''}" data-sensor-idx="${idx}">
        <td class="px-4 py-3 font-medium text-white">
          ${sensor.originalName}
          <span class="text-xs text-white/40 block">${stats ? stats.valid + ' registros válidos' : ''}</span>
        </td>
        <td class="px-4 py-3">
          <select class="glass-input text-sm sensor-role-select" data-idx="${idx}">
            <option value="pulpa" ${sensor.role === 'pulpa' ? 'selected' : ''}>Pulpa</option>
            <option value="ambiente" ${sensor.role === 'ambiente' ? 'selected' : ''}>Ambiente</option>
            <option value="excluido" ${sensor.role === 'excluido' ? 'selected' : ''}>Excluido</option>
          </select>
        </td>
        <td class="px-4 py-3">
          <input type="text" class="glass-input text-sm sensor-custom-name" data-idx="${idx}" value="${sensor.customName}" placeholder="Nombre personalizado" />
        </td>
        <td class="px-4 py-3 text-white/60">${sampleValue}${sampleValue !== '-' ? '°C' : ''}</td>
        <td class="px-4 py-3 text-white/60">${avg}${avg !== '-' ? '°C' : ''}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.sensor-role-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.idx);
      currentState.sensorConfig[idx].role = sel.value;
      const row = sel.closest('tr');
      if (sel.value === 'excluido') {
        row.classList.add('opacity-40');
      } else {
        row.classList.remove('opacity-40');
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
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.2);">
          <svg class="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-white mb-2">Protocolo No Encontrado</h3>
        <p class="text-white/50 mb-6">No existe un protocolo configurado para:<br/>
          <strong class="text-white/80">${meta.product} - ${meta.variety} - ${meta.destinationCountry}</strong>
        </p>
        <p class="text-sm text-white/30 mb-6">Configure el protocolo en Admin → Protocolos</p>
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
    <div class="text-center mb-8 scale-in">
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${isApproved ? 'hero-approved' : 'hero-rejected'}" style="box-shadow: 0 0 30px ${isApproved ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};">
        ${isApproved
          ? '<svg class="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
          : '<svg class="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
        }
      </div>
      <h2 class="text-2xl font-bold ${isApproved ? 'text-green-400' : 'text-red-400'}">
        ${isApproved ? 'APROBADO' : 'NO APROBADO'}
      </h2>
      <p class="text-white/50 mt-1">${result.summary}</p>
    </div>

    <!-- Treatment Info -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
      <div class="meta-card">
        <span class="text-white/50 block">Cámara</span>
        <span class="font-semibold text-white">${meta.cameraName}</span>
      </div>
      <div class="meta-card">
        <span class="text-white/50 block">Producto</span>
        <span class="font-semibold text-white">${meta.product} ${meta.variety}</span>
      </div>
      <div class="meta-card">
        <span class="text-white/50 block">Destino</span>
        <span class="font-semibold text-white">${meta.destinationCountry}</span>
      </div>
      <div class="meta-card">
        <span class="text-white/50 block">Protocolo</span>
        <span class="font-semibold text-white">${protocol.pais || '-'} · SDP ${protocol.categoria_SDP || '-'}</span>
      </div>
    </div>

    <!-- Parameters Used -->
    ${result.params ? `
    <div class="p-4 rounded-xl mb-6 text-sm" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);">
      <h4 class="font-semibold text-white/80 mb-2">Parámetros de Evaluación</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><span class="text-white/50">Temp. Mín:</span> <span class="font-medium text-white">${result.params.temperatureMin}°C</span></div>
        <div><span class="text-white/50">Temp. Requerida:</span> <span class="font-medium text-white">${result.params.temperatureTarget}°C</span></div>
        <div><span class="text-white/50">Temp. Máx:</span> <span class="font-medium text-white">${result.params.temperatureMax}°C</span></div>
        <div><span class="text-white/50">Duración:</span> <span class="font-medium text-white">${result.params.durationDays} días</span></div>
        <div><span class="text-white/50">Máx. Gap:</span> <span class="font-medium text-white">${result.params.maxGapHours}h</span></div>
        <div><span class="text-white/50">Frecuencia:</span> <span class="font-medium text-white">cada ${result.params.recordingIntervalHours}h</span></div>
        <div><span class="text-white/50">Mín. Sensores Pulpa:</span> <span class="font-medium text-white">${result.params.minSensorsPulpa}</span></div>
        <div><span class="text-white/50">Restricción:</span> <span class="font-medium text-white">${meta.energyRestriction ? meta.restrictionStart + ' - ' + meta.restrictionEnd : 'No'}</span></div>
      </div>
    </div>
    ` : ''}

    <!-- Validations -->
    <h3 class="font-semibold mb-3 text-white">Validaciones</h3>
    <div class="space-y-3 mb-6">
      ${result.validations.map(v => `
          <div class="p-3 rounded-xl ${v.status === 'cumple' ? 'validation-pass' : v.status === 'no_cumple' ? 'validation-fail' : 'validation-info'} fade-in-up">
          <div class="flex items-start gap-3">
          <div class="flex-shrink-0 mt-0.5">
            ${v.status === 'cumple'
              ? '<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
              : v.status === 'info'
              ? '<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
              : '<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
            }
          </div>
          <div class="flex-1">
            <span class="font-medium ${v.status === 'cumple' ? 'text-green-300' : v.status === 'info' ? 'text-blue-300' : 'text-red-300'}">${v.name}</span>
            <p class="text-sm whitespace-pre-line ${v.status === 'cumple' ? 'text-green-400/70' : v.status === 'info' ? 'text-blue-400/70' : 'text-red-400/70'}">${v.detail}</p>
          </div>
          </div>
        </div>
      `).join('')}
    </div>

    ${result.deviations && result.deviations.length > 0 ? `
      <h3 class="font-semibold mb-3 text-red-400">Desviaciones Detectadas (${result.deviations.length} registros fuera de rango)</h3>
      <div class="rounded-xl overflow-hidden mb-6" style="border: 1px solid rgba(239,68,68,0.15);">
        <table class="data-table text-sm">
          <thead>
            <tr>
              <th>Sensor</th>
              <th>Fecha/Hora</th>
              <th>Temperatura</th>
              <th>Rango Permitido</th>
            </tr>
          </thead>
          <tbody>
            ${result.deviations.slice(0, 30).map(d => `
              <tr>
                <td>${d.sensor}</td>
                <td>${d.timestamp.toLocaleString('es-CL')}</td>
                <td class="text-red-400 font-medium">${d.value}°C</td>
                <td>${d.minAllowed || d.maxAllowed ? `${d.minAllowed ?? '-'} a ${d.maxAllowed ?? '-'}` : `≤ ${d.maxAllowed}°C`}</td>
              </tr>
            `).join('')}
            ${result.deviations.length > 30 ? `<tr><td colspan="4" class="text-center text-white/30 py-2">... y ${result.deviations.length - 30} registros más fuera de rango</td></tr>` : ''}
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
    await persistEvaluation(user);
    navigateTo('/');
  });

  container.querySelector('#downloadReport').addEventListener('click', async () => {
    await persistEvaluation(user);
    generatePDFReport();
  });
}

async function persistEvaluation(user) {
  try {
    await saveEvaluation(user, {
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

    if (i < step) {
      indicator.className = 'step-completed';
      indicator.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
    } else if (i === step) {
      indicator.className = 'step-active';
      indicator.innerHTML = i;
    } else {
      indicator.className = 'step-inactive';
      indicator.innerHTML = i;
    }
  }

  const line1 = document.getElementById('line1');
  const line2 = document.getElementById('line2');
  if (line1) line1.className = step >= 2 ? 'step-line-active' : 'step-line';
  if (line2) line2.className = step >= 3 ? 'step-line-active' : 'step-line';
}
