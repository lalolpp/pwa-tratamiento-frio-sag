import { requireAuth } from '../auth/authGuard.js';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase.js';
import { navigateTo } from '../utils/router.js';
import {
  SAG_COUNTRIES, SAG_VARIETIES, SAG_FAMILIES, QUARANTINE_PESTS, TREATMENT_TYPES,
} from '../config/sagData.js';
import { getAllProtocols } from '../services/protocolService.js';

const CHECKLIST_STORAGE_KEY = 'checklist_progress';

export function renderChecklist(container) {
  requireAuth(async (user) => {
    container.innerHTML = shellHTML(user);
    attachEvents(container, user);
  });
}

function shellHTML(user) {
  return `
    <div class="min-h-screen">
      <nav class="glass-nav sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <a href="#/" class="text-white/50 hover:text-white/80 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </a>
            <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
            <span class="font-bold text-white">Checklist de Exportación</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-white/50">${user.email}</span>
            <button id="logoutBtn" class="text-sm text-white/50 hover:text-white/80 transition-colors">Salir</button>
          </div>
        </div>
      </nav>
      <div id="checklistBody" class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8"></div>
    </div>`;
}

function attachEvents(container, user) {
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.hash = '#/login';
  });
  renderSelector(container);
}

async function renderSelector(container) {
  const body = container.querySelector('#checklistBody');

  const familyEntries = Object.entries(SAG_FAMILIES);
  const productOptions = familyEntries.flatMap(([k, f]) =>
    f.species.map(p => `<option value="${p}">${p} (${f.name})</option>`)
  ).join('');

  body.innerHTML = `
    <div class="glass-card-static mb-6 fade-in-up">
      <h2 class="text-lg font-semibold text-white mb-4">Seleccionar Protocolo</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="label">País Destino</label>
          <select id="clCountry" class="glass-input">
            <option value="">Seleccionar...</option>
            ${SAG_COUNTRIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">Producto</label>
          <select id="clProduct" class="glass-input" disabled>
            <option value="">Primero seleccionar país...</option>
          </select>
        </div>
        <div>
          <label class="label">Variedad</label>
          <select id="clVariety" class="glass-input" disabled>
            <option value="">Primero seleccionar producto...</option>
          </select>
        </div>
        <div class="flex items-end">
          <button id="clSearch" class="btn-primary w-full" disabled>Buscar Protocolo</button>
        </div>
      </div>
    </div>
    <div id="clResult"></div>`;

  const countriesWithProtocols = await getCountriesWithProtocols();

  document.getElementById('clCountry').addEventListener('change', (e) => {
    const country = e.target.value;
    const products = countriesWithProtocols[country] || [];
    const prodSel = document.getElementById('clProduct');
    const varSel = document.getElementById('clVariety');

    if (products.length) {
      prodSel.innerHTML = `<option value="">Seleccionar...</option>` +
        products.map(p => `<option value="${p}">${p}</option>`).join('');
      prodSel.disabled = false;
    } else {
      prodSel.innerHTML = `<option value="">No hay productos</option>`;
      prodSel.disabled = true;
    }
    varSel.innerHTML = `<option value="">Seleccionar producto primero...</option>`;
    varSel.disabled = true;
    document.getElementById('clSearch').disabled = true;
    document.getElementById('clResult').innerHTML = '';
  });

  document.getElementById('clProduct').addEventListener('change', (e) => {
    const product = e.target.value;
    const varieties = SAG_VARIETIES[product] || [];
    const varSel = document.getElementById('clVariety');

    if (varieties.length) {
      varSel.innerHTML = `<option value="">Todas las variedades</option>` +
        varieties.map(v => `<option value="${v}">${v}</option>`).join('');
      varSel.disabled = false;
    } else {
      varSel.innerHTML = `<option value="">No aplica</option>`;
      varSel.disabled = true;
    }
    document.getElementById('clSearch').disabled = false;
  });

  document.getElementById('clVariety').addEventListener('change', () => {
    document.getElementById('clSearch').disabled = false;
  });

  document.getElementById('clSearch').addEventListener('click', async () => {
    const country = document.getElementById('clCountry').value;
    const product = document.getElementById('clProduct').value;
    const variety = document.getElementById('clVariety').value;
    if (!country || !product) return;
    await searchProtocol(container, country, product, variety);
  });
}

async function getCountriesWithProtocols() {
  try {
    const protocols = await getAllProtocols();
    const map = {};
    protocols.filter(p => p.vigente !== false).forEach(p => {
      if (!map[p.pais]) map[p.pais] = new Set();
      map[p.pais].add(p.producto);
    });
    const result = {};
    for (const [k, v] of Object.entries(map)) {
      result[k] = [...v];
    }
    return result;
  } catch {
    return {};
  }
}

async function searchProtocol(container, country, product, variety) {
  const resultDiv = container.querySelector('#clResult');
  resultDiv.innerHTML = '<div class="text-center py-8 text-white/30">Buscando protocolo...</div>';

  try {
    const protocols = await getAllProtocols();
    let match = protocols.find(p =>
      p.pais === country && p.producto === product && p.vigente !== false &&
      (p.variedades?.includes(variety) || !p.variedades?.length || !variety)
    );

    if (!match) {
      resultDiv.innerHTML = `
        <div class="glass-card-static" style="border-left: 3px solid #f59e0b;">
          <div class="flex items-center gap-3">
            <svg class="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <div>
              <p class="font-semibold text-yellow-400">No se encontró protocolo</p>
              <p class="text-sm text-white/50">No hay protocolo vigente para ${product} → ${country}${variety ? ` (${variety})` : ''}</p>
            </div>
          </div>
        </div>`;
      return;
    }

    renderProtocolChecklist(resultDiv, match, variety);
  } catch (err) {
    resultDiv.innerHTML = `<div class="glass-card-static text-red-400 text-center py-8">${err.message}</div>`;
  }
}

function renderProtocolChecklist(container, protocol, selectedVariety) {
  const countryInfo = SAG_COUNTRIES.find(c => c.name === protocol.pais);
  const pests = QUARANTINE_PESTS[countryInfo?.id] || [];
  const savedProgress = loadProgress(protocol);
  const items = (protocol.checklist_exportacion || []).map((text, i) => ({
    id: `cl_${protocol.pais}_${protocol.producto}_${i}`,
    text: text.replace(/^[☐✓✗]\s*/, ''),
    checked: savedProgress.includes(i),
  }));

  container.innerHTML = `
    <div class="space-y-6 fade-in-up">
      <!-- Protocol Info Header -->
      <div class="glass-card-static">
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <h2 class="text-xl font-bold text-white">${protocol.producto}</h2>
              ${protocol.familia ? `<span class="px-2 py-0.5 rounded text-sm font-medium" style="background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.2); color: #a5b4fc;">${protocol.familia}</span>` : ''}
              <span class="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs ${protocol.categoria_SDP === 'A' ? 'bg-green-500' : protocol.categoria_SDP === 'B' ? 'bg-yellow-500' : 'bg-red-500'}">${protocol.categoria_SDP || 'B'}</span>
            </div>
            <p class="text-sm text-white/50">Destino: <span class="font-medium text-white/80">${protocol.pais}</span> · ${protocol.organismo_destino || ''}</p>
          </div>
          <div class="flex gap-2">
            <button id="clPrint" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              Imprimir
            </button>
            <button id="clReset" class="text-sm text-red-400 hover:text-red-300 transition-colors">Reiniciar</button>
          </div>
        </div>
        <div class="flex flex-wrap gap-3 text-sm">
          ${protocol.variedades?.length ? `
            <div class="rounded-lg px-3 py-2" style="background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.1);">
              <span class="text-white/50">Variedades:</span>
              <span class="font-medium text-white/80 ml-1">${protocol.variedades.join(', ')}</span>
            </div>` : ''}
          ${pests.length ? `
            <div class="rounded-lg px-3 py-2" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.15);">
              <span class="text-red-400 font-medium">Plagas cuarentenarias:</span>
              <span class="text-red-300/80 ml-1">${pests.join(', ')}</span>
            </div>` : ''}
        </div>
        ${protocol.objetivo ? `
          <div class="mt-3 p-3 rounded-xl" style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.15);">
            <p class="text-sm text-blue-300/80">${protocol.objetivo}</p>
          </div>` : ''}
        ${protocol.descripcion_protocolo?.length ? `
          <div class="mt-3 space-y-1">
            ${protocol.descripcion_protocolo.map(d => `<p class="text-sm text-white/50">${d}</p>`).join('')}
          </div>` : ''}
      </div>

      <!-- Treatment Parameters -->
      ${protocol.temperatureMax !== undefined ? `
      <div class="glass-card-static">
        <h3 class="font-semibold mb-3 text-white">Parámetros del Tratamiento</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="rounded-xl p-3" style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.15);">
            <p class="text-xs text-blue-400/70 mb-1">Temp. Máxima</p>
            <p class="text-lg font-bold text-blue-300">${protocol.temperatureMax}°C</p>
          </div>
          <div class="rounded-xl p-3" style="background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.15);">
            <p class="text-xs text-green-400/70 mb-1">Duración Requerida</p>
            <p class="text-lg font-bold text-green-300">${protocol.durationDays} días</p>
          </div>
          <div class="rounded-xl p-3" style="background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.15);">
            <p class="text-xs text-purple-400/70 mb-1">Sensores Mínimos</p>
            <p class="text-lg font-bold text-purple-300">${protocol.minSensorsPulpa}</p>
          </div>
          <div class="rounded-xl p-3" style="background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.15);">
            <p class="text-xs text-yellow-400/70 mb-1">Temp. Objetivo</p>
            <p class="text-lg font-bold text-yellow-300">${protocol.temperatureTarget ?? '-0.5'}°C</p>
          </div>
        </div>
      </div>` : ''}

      <!-- Checklist Section -->
      <div class="glass-card-static" id="clChecklistCard">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Checklist de Exportación</h3>
          <div class="flex items-center gap-2">
            <span class="text-sm text-white/50">Progreso:</span>
            <div class="w-32 rounded-full h-2.5" style="background: rgba(148,163,184,0.15);">
              <div id="clProgressBar" class="h-2.5 rounded-full transition-all" style="width: ${items.length ? Math.round((items.filter(i => i.checked).length / items.length) * 100) : 0}%; background: linear-gradient(90deg, #22c55e, #16a34a);"></div>
            </div>
            <span id="clProgressText" class="text-sm font-medium text-white/80">${items.filter(i => i.checked).length}/${items.length}</span>
          </div>
        </div>
        ${items.length ? `
          <div class="space-y-2" id="clItems">
            ${items.map(item => `
              <label class="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${item.checked ? '' : ''}" style="background: ${item.checked ? 'rgba(34,197,94,0.08)' : 'rgba(148,163,184,0.06)'}; border: 1px solid ${item.checked ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.08)'};" data-id="${item.id}">
                <input type="checkbox" class="cl-check mt-0.5 w-5 h-5 rounded" style="accent-color: #22c55e;" data-idx="${items.indexOf(item)}" ${item.checked ? 'checked' : ''} />
                <span class="text-sm ${item.checked ? 'text-green-300 line-through' : 'text-white/70'}">${item.text}</span>
              </label>
            `).join('')}
          </div>` : `
          <div class="text-center py-6 text-white/30">
            <p>No hay ítems de checklist definidos para este protocolo</p>
          </div>`}
      </div>

      <!-- Requisitos -->
      ${protocol.requisitos?.length ? `
      <div class="glass-card-static">
        <h3 class="font-semibold mb-3 text-white">Requisitos del Protocolo</h3>
        <ul class="space-y-2">
          ${protocol.requisitos.map(r => `
            <li class="flex items-start gap-2 text-sm text-white/70">
              <svg class="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>${r}</span>
            </li>`).join('')}
        </ul>
      </div>` : ''}

      <!-- Controles -->
      ${protocol.controles?.length ? `
      <div class="glass-card-static">
        <h3 class="font-semibold mb-3 text-white">Controles Fitosanitarios</h3>
        <ul class="space-y-2">
          ${protocol.controles.map(c => `
            <li class="flex items-start gap-2 text-sm text-white/70">
              <svg class="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              <span>${c}</span>
            </li>`).join('')}
        </ul>
      </div>` : ''}

      <!-- Tratamientos -->
      ${protocol.tratamientos?.length ? `
      <div class="glass-card-static">
        <h3 class="font-semibold mb-3 text-white">Tratamientos Requeridos</h3>
        <div class="space-y-3">
          ${protocol.tratamientos.map(t => {
            const ti = TREATMENT_TYPES[t.tipo] || { name: t.tipo, icon: '📋' };
            return `
              <div class="flex items-center gap-3 p-3 rounded-xl" style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.15);">
                <span class="text-xl">${ti.icon}</span>
                <div>
                  <p class="font-medium text-blue-300">${ti.name}</p>
                  ${t.registro?.length ? `<p class="text-xs text-blue-400/70">Registro: ${t.registro.join(', ')}</p>` : ''}
                </div>
                ${t.aplica ? '<span class="badge-success ml-auto">Aplica</span>' : '<span class="badge-warning ml-auto">No aplica</span>'}
              </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Documentación -->
      ${protocol.documentacion?.length ? `
      <div class="glass-card-static">
        <h3 class="font-semibold mb-3 text-white">Documentación Requerida</h3>
        <div class="flex flex-wrap gap-2">
          ${protocol.documentacion.map(d => `
            <span class="px-3 py-1 rounded-full text-sm font-medium" style="background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.2); color: #c4b5fd;">${d}</span>
          `).join('')}
        </div>
      </div>` : ''}

      <!-- Registros Obligatorios -->
      ${protocol.registros_obligatorios?.length ? `
      <div class="glass-card-static">
        <h3 class="font-semibold mb-3 text-white">Registros Obligatorios</h3>
        <div class="space-y-2">
          ${protocol.registros_obligatorios.map(r => `
            <div class="flex items-start gap-2 text-sm text-white/70">
              <svg class="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              <div><span class="font-medium">${r.tipo}:</span> <span class="text-white/50">${(r.campos || []).join(', ')}</span></div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Observaciones -->
      ${protocol.observaciones ? `
      <div class="glass-card-static" style="border-left: 3px solid #f59e0b;">
        <h3 class="font-semibold text-yellow-400 mb-2">Observaciones</h3>
        <p class="text-sm text-white/60">${protocol.observaciones}</p>
      </div>` : ''}

      <!-- Restricciones Especiales -->
      ${protocol.restricciones_especiales ? `
      <div class="glass-card-static" style="border-left: 3px solid #ef4444;">
        <h3 class="font-semibold text-red-400 mb-2">Restricciones Especiales</h3>
        <p class="text-sm text-white/60">${protocol.restricciones_especiales}</p>
      </div>` : ''}
    </div>`;

  attachChecklistEvents(container, protocol, items);
}

function attachChecklistEvents(container, protocol, items) {
  container.querySelectorAll('.cl-check').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      items[idx].checked = e.target.checked;
      updateChecklistUI(container, items, protocol);
      saveProgress(protocol, items);
    });
  });

  document.getElementById('clPrint')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('clReset')?.addEventListener('click', () => {
    if (confirm('Reiniciar todo el checklist?')) {
      items.forEach(i => i.checked = false);
      clearProgress(protocol);
      updateChecklistUI(container, items, protocol);
    }
  });
}

function updateChecklistUI(container, items, protocol) {
  const total = items.length;
  const checked = items.filter(i => i.checked).length;
  const pct = total ? Math.round((checked / total) * 100) : 0;

  const bar = document.getElementById('clProgressBar');
  const text = document.getElementById('clProgressText');
  if (bar) bar.style.width = `${pct}%`;
  if (text) text.textContent = `${checked}/${total}`;

  const labels = container.querySelectorAll('#clItems label');
  labels.forEach((label, i) => {
    if (!items[i]) return;
    const cb = label.querySelector('.cl-check');
    const span = label.querySelector('span');
    if (items[i].checked) {
      label.style.background = 'rgba(34,197,94,0.08)';
      label.style.borderColor = 'rgba(34,197,94,0.15)';
      span.className = 'text-sm text-green-300 line-through';
    } else {
      label.style.background = 'rgba(148,163,184,0.06)';
      label.style.borderColor = 'rgba(148,163,184,0.08)';
      span.className = 'text-sm text-white/70';
    }
  });
}

function getStorageKey(protocol) {
  return `${CHECKLIST_STORAGE_KEY}_${protocol.pais}_${protocol.producto}`;
}

function loadProgress(protocol) {
  try {
    const data = localStorage.getItem(getStorageKey(protocol));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveProgress(protocol, items) {
  try {
    const checkedIndices = items.filter(i => i.checked).map((_, idx) => idx);
    localStorage.setItem(getStorageKey(protocol), JSON.stringify(checkedIndices));
  } catch { }
}

function clearProgress(protocol) {
  try {
    localStorage.removeItem(getStorageKey(protocol));
  } catch { }
}
