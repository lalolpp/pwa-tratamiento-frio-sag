import { requireAuth } from '../../auth/authGuard.js';
import {
  getAllProtocols, getProtocolById, createProtocol, updateProtocol,
  deleteProtocol, seedInitialProtocols, getProtocolStats, getCountriesSummary,
} from '../../services/protocolService.js';
import {
  SAG_COUNTRIES, SAG_VARIETIES, SAG_FAMILIES, SDP_CATEGORIES,
  QUARANTINE_PESTS, TREATMENT_TYPES, DEFAULT_DOCUMENT_CHECKLIST,
  getDefaultProtocolTemplate,
} from '../../config/sagData.js';
import {
  exportProtocolPDF, exportProtocolExcel,
  exportAllProtocolsPDF, exportAllProtocolsExcel,
} from '../../utils/exportUtils.js';

let editingProtocol = null;

export function renderSagAdmin(container) {
  requireAuth(async (user) => {
    editingProtocol = null;
    container.innerHTML = shellHTML();
    await renderList(container, user);
  });
}

function shellHTML() {
  return `
    <div class="min-h-screen bg-gray-50">
      <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <a href="#/" class="text-gray-500 hover:text-gray-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </a>
            <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span class="font-bold">Administrador Protocolos SAG</span>
          </div>
          <div id="headerActions"></div>
        </div>
      </nav>
      <div id="adminBody" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"></div>
    </div>`;
}

async function renderList(container, user) {
  const body = container.querySelector('#adminBody');
  const hdr = container.querySelector('#headerActions');
  hdr.innerHTML = `<div class="flex gap-2"><button id="seedBtn" class="btn-secondary text-sm">Cargar Protocolos SAG</button><button id="addBtn" class="btn-primary text-sm">+ Nuevo Protocolo</button></div>`;
  body.innerHTML = '<div class="text-center py-12 text-gray-400">Cargando...</div>';

  try {
    const [stats, countries] = await Promise.all([getProtocolStats(), getCountriesSummary()]);
    body.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div class="card text-center"><p class="text-3xl font-bold text-primary-600">${stats.total}</p><p class="text-sm text-gray-500">Total</p></div>
        <div class="card text-center"><p class="text-3xl font-bold text-green-600">${stats.active}</p><p class="text-sm text-gray-500">Vigentes</p></div>
        <div class="card text-center"><p class="text-3xl font-bold text-red-600">${stats.inactive}</p><p class="text-sm text-gray-500">No Vigentes</p></div>
        <div class="card text-center"><p class="text-3xl font-bold text-purple-600">${stats.countries}</p><p class="text-sm text-gray-500">Países</p></div>
        <div class="card text-center"><p class="text-3xl font-bold text-indigo-600">${stats.products}</p><p class="text-sm text-gray-500">Productos</p></div>
      </div>
      <div class="card mb-8"><h2 class="text-lg font-semibold mb-4">Categorías Fitossanitarias SDP</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${Object.entries(SDP_CATEGORIES).map(([k, c]) => `
            <div class="p-4 rounded-lg border-2 ${k === 'A' ? 'border-green-200 bg-green-50' : k === 'B' ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}">
              <div class="flex items-center gap-2 mb-2"><span class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${k === 'A' ? 'bg-green-500' : k === 'B' ? 'bg-yellow-500' : 'bg-red-500'}">${k}</span><span class="font-semibold">${c.name}</span></div>
              <p class="text-sm text-gray-600">${c.description}</p>
              <p class="text-xs mt-2 ${c.treatmentRequired ? 'text-red-600 font-medium' : 'text-green-600'}">${c.treatmentRequired ? 'Requiere tratamiento' : 'Sin tratamiento'}</p>
            </div>`).join('')}
        </div>
      </div>
      <h2 class="text-lg font-semibold mb-4">Protocolos por País Destino</h2>
      ${countries.length === 0 ? `<div class="card text-center py-8"><p class="text-gray-400 mb-4">No hay protocolos</p><button id="seedBtn2" class="btn-primary">Cargar Protocolos Iniciales</button></div>` :
      `<div class="space-y-3">${countries.map(c => {
        const info = SAG_COUNTRIES.find(sc => sc.name === c.pais);
        const pests = QUARANTINE_PESTS[info?.id] || [];
        return `<div class="card hover:shadow-lg transition-shadow cursor-pointer country-card" data-country="${c.pais}">
          <div class="flex items-start justify-between">
            <div><div class="flex items-center gap-3 mb-2"><h3 class="text-lg font-bold">${c.pais}</h3>${info?.organism ? `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">${info.organism}</span>` : ''}</div>
            <div class="flex flex-wrap gap-2 mb-2">${c.products.map(p => `<span class="badge-success text-xs">${p}</span>`).join('')}</div>
            <p class="text-sm text-gray-500">${c.active} vigente(s) de ${c.total} · ${pests.length} plagas cuarentenarias</p></div>
            <svg class="w-5 h-5 text-gray-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div></div>`;
      }).join('')}</div>`}`;

    document.getElementById('seedBtn')?.addEventListener('click', async () => { const r = await seedInitialProtocols(); alert(`${r.seeded} protocolos cargados`); await renderList(container, user); });
    document.getElementById('seedBtn2')?.addEventListener('click', async () => { const r = await seedInitialProtocols(); alert(`${r.seeded} protocolos cargados`); await renderList(container, user); });
    document.getElementById('addBtn')?.addEventListener('click', () => { editingProtocol = getDefaultProtocolTemplate(); renderForm(container, user); });
    body.querySelectorAll('.country-card').forEach(c => c.addEventListener('click', () => renderCountry(container, user, c.dataset.country)));
  } catch (e) { body.innerHTML = `<div class="card text-danger py-8 text-center">${e.message}</div>`; }
}

async function renderCountry(container, user, country) {
  const body = container.querySelector('#adminBody');
  const hdr = container.querySelector('#headerActions');
    hdr.innerHTML = `<button id="backBtn" class="btn-secondary text-sm">← Volver</button><div class="flex gap-2"><button id="exportCountryPDF" class="btn-secondary text-sm flex items-center gap-1">📄 PDF</button><button id="exportCountryXLSX" class="btn-secondary text-sm flex items-center gap-1">📊 XLSX</button></div>`;
  body.innerHTML = '<div class="text-center py-12 text-gray-400">Cargando...</div>';

  try {
    const all = await getAllProtocols();
    const protos = all.filter(p => p.pais === country);
    const info = SAG_COUNTRIES.find(c => c.name === country);
    const pests = QUARANTINE_PESTS[info?.id] || [];

    body.innerHTML = `
      <div class="mb-6"><button id="backBtn2" class="text-gray-500 hover:text-gray-700 text-sm mb-2">← Volver</button>
        <div class="flex items-center gap-3"><h2 class="text-2xl font-bold">${country}</h2>${info?.organism ? `<span class="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm">${info.organism}</span>` : ''}</div>
        <p class="text-gray-500 mt-1">${protos.length} protocolo(s)</p></div>
      ${pests.length > 0 ? `<div class="card mb-6 border-l-4 border-red-500"><h3 class="font-semibold text-red-700 mb-2">Plagas Cuarentenarias</h3><div class="flex flex-wrap gap-2">${pests.map(p => `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-sm">${p}</span>`).join('')}</div></div>` : ''}
      ${protos.length === 0 ? `<div class="card text-center py-8"><p class="text-gray-400 mb-4">Sin protocolos</p><button class="btn-primary add-for-country" data-p="${country}">+ Agregar</button></div>` :
      `<div class="space-y-4">${protos.map(proto => `
        <div class="card">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold">${proto.producto}</h3>
              ${proto.familia ? `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">${proto.familia}</span>` : ''}
              <span class="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs ${proto.categoria_SDP === 'A' ? 'bg-green-500' : proto.categoria_SDP === 'B' ? 'bg-yellow-500' : 'bg-red-500'}">${proto.categoria_SDP || 'B'}</span>
              ${proto.vigente ? '<span class="badge-success">Vigente</span>' : '<span class="badge-danger">No Vigente</span>'}
            </div>
            <div class="flex gap-2"><button class="text-primary-600 hover:underline text-sm export-pdf" data-id="${proto.id}">PDF</button><button class="text-primary-600 hover:underline text-sm export-xlsx" data-id="${proto.id}">XLSX</button><button class="text-primary-600 hover:underline text-sm edit-proto" data-id="${proto.id}">Editar</button><button class="text-red-500 hover:underline text-sm del-proto" data-id="${proto.id}">Eliminar</button></div>
          </div>
          ${proto.variedades?.length ? `<div class="mb-2"><span class="text-xs text-gray-500 uppercase">Variedades:</span><div class="flex flex-wrap gap-1 mt-1">${proto.variedades.map(v => `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">${v}</span>`).join('')}</div></div>` : ''}
          ${proto.requisitos?.length ? `<div class="mb-2"><span class="text-xs text-gray-500 uppercase">Requisitos:</span><ul class="mt-1 space-y-1">${proto.requisitos.map(r => `<li class="text-sm flex items-start gap-2"><svg class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>${r}</li>`).join('')}</ul></div>` : ''}
          ${proto.tratamientos?.length ? `<div class="mb-2"><span class="text-xs text-gray-500 uppercase">Tratamientos:</span><div class="flex flex-wrap gap-2 mt-1">${proto.tratamientos.map(t => { const ti = TREATMENT_TYPES[t.tipo] || { name: t.tipo, icon: '📋' }; return `<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">${ti.icon} ${ti.name}</span>`; }).join('')}</div></div>` : ''}
          ${proto.documentacion?.length ? `<div class="mb-2"><span class="text-xs text-gray-500 uppercase">Documentación:</span><div class="flex flex-wrap gap-1 mt-1">${proto.documentacion.map(d => `<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">${d}</span>`).join('')}</div></div>` : ''}
          ${proto.checklist_exportacion?.length ? `<div class="mb-2"><span class="text-xs text-gray-500 uppercase">Checklist Exportación:</span><div class="mt-1 space-y-0.5">${proto.checklist_exportacion.map(c => `<p class="text-sm text-gray-700">${c}</p>`).join('')}</div></div>` : ''}
          ${proto.registros_obligatorios?.length ? `<div class="mb-2"><span class="text-xs text-gray-500 uppercase">Registros Obligatorios:</span><div class="mt-1 space-y-1">${proto.registros_obligatorios.map(r => `<div class="text-sm"><span class="font-medium">${r.tipo}:</span> <span class="text-gray-500">${(r.campos || []).join(', ')}</span></div>`).join('')}</div></div>` : ''}
          ${proto.observaciones ? `<p class="text-xs text-gray-400 mt-2 italic">${proto.observaciones}</p>` : ''}
        </div>`).join('')}</div>`}`;

    document.getElementById('backBtn')?.addEventListener('click', () => renderList(container, user));
    document.getElementById('backBtn2')?.addEventListener('click', () => renderList(container, user));
    document.getElementById('exportCountryPDF')?.addEventListener('click', () => {
      if (protos.length === 0) { alert('No hay protocolos para exportar'); return; }
      exportAllProtocolsPDF(protos, `Protocolos_${country}.pdf`);
    });
    document.getElementById('exportCountryXLSX')?.addEventListener('click', () => {
      if (protos.length === 0) { alert('No hay protocolos para exportar'); return; }
      exportAllProtocolsExcel(protos, `Protocolos_${country}.xlsx`);
    });
    body.querySelectorAll('.export-pdf').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const p = protos.find(pr => pr.id === b.dataset.id);
      if (p) exportProtocolPDF(p);
    }));
    body.querySelectorAll('.export-xlsx').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const p = protos.find(pr => pr.id === b.dataset.id);
      if (p) exportProtocolExcel(p);
    }));
    body.querySelectorAll('.edit-proto').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); const p = await getProtocolById(b.dataset.id); if (p) { editingProtocol = { ...p, id: b.dataset.id }; renderForm(container, user); } }));
    body.querySelectorAll('.del-proto').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); if (confirm('¿Eliminar?')) { await deleteProtocol(b.dataset.id); await renderCountry(container, user, country); } }));
    body.querySelectorAll('.add-for-country').forEach(b => b.addEventListener('click', () => { editingProtocol = { ...getDefaultProtocolTemplate(), pais: b.dataset.p }; renderForm(container, user); }));
  } catch (e) { body.innerHTML = `<div class="card text-danger py-8 text-center">${e.message}</div>`; }
}

function renderForm(container, user) {
  const body = container.querySelector('#adminBody');
  const hdr = container.querySelector('#headerActions');
  const p = editingProtocol;
  const isEdit = p.id && !String(p.id).startsWith('new');

  hdr.innerHTML = '<button id="backForm" class="btn-secondary text-sm">← Volver</button>';

  const familyEntries = Object.entries(SAG_FAMILIES);
  const productOptions = familyEntries.flatMap(([k, f]) => f.species.map(pr => `<option value="${pr}" data-family="${f.name}" ${p.producto === pr ? 'selected' : ''}>${pr} (${f.name})</option>`)).join('');

  body.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <h2 class="text-xl font-bold mb-6">${isEdit ? 'Editar Protocolo' : 'Nuevo Protocolo SAG'}</h2>
      <form id="protoForm" class="space-y-6">
        <div class="card"><h3 class="font-semibold mb-4">Información General</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label class="label">País Destino *</label><select id="fPais" class="input-field" required>${SAG_COUNTRIES.map(c => `<option value="${c.name}" ${p.pais === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
            <div><label class="label">Producto *</label><select id="fProducto" class="input-field" required><option value="">Seleccionar...</option>${productOptions}</select></div>
            <div><label class="label">Categoría SDP *</label><select id="fCategoria" class="input-field" required>${Object.entries(SDP_CATEGORIES).map(([k, c]) => `<option value="${k}" ${p.categoria_SDP === k ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
          </div>
          <div class="mt-4"><label class="label">Variedades</label><div id="varsBox" class="flex flex-wrap gap-2 mt-1">${(SAG_VARIETIES[p.producto] || []).map(v => `<label class="flex items-center gap-1 text-sm bg-gray-100 px-2 py-1 rounded cursor-pointer hover:bg-gray-200"><input type="checkbox" name="variedad" value="${v}" ${(p.variedades || []).includes(v) ? 'checked' : ''} class="var-chk" />${v}</label>`).join('')}</div></div>
          <div class="mt-4"><label class="label">Organismo Destino</label><input type="text" id="fOrganismo" class="input-field" value="${p.organismo_destino || ''}" placeholder="Ej: GACC, USDA-APHIS..." /></div>
          <div class="mt-4"><label class="label">Objetivo del Protocolo</label><textarea id="fObjetivo" class="input-field" rows="2" placeholder="Descripción del objetivo...">${p.objetivo || ''}</textarea></div>
          <div class="mt-4"><label class="label">Descripción del Protocolo</label><div id="descList" class="space-y-2">${(p.descripcion_protocolo || []).map(d => `<div class="flex gap-2 ri"><input type="text" value="${d}" class="input-field descin flex-1" placeholder="Párrafo descriptivo..." /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div><button type="button" id="addDesc" class="btn-secondary text-sm mt-3">+ Párrafo</button></div>
          <div class="mt-4"><label class="flex items-center gap-2"><input type="checkbox" id="fVigente" ${p.vigente !== false ? 'checked' : ''} /><span class="text-sm font-medium">Vigente</span></label></div>
        </div>

        <div class="card"><h3 class="font-semibold mb-4">Requisitos</h3>
          <div id="reqList" class="space-y-2">${(p.requisitos || []).map(r => `<div class="flex gap-2 ri"><input type="text" value="${r}" class="input-field rin flex-1" /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addReq" class="btn-secondary text-sm mt-3">+ Requisito</button>
        </div>

        <div class="card"><h3 class="font-semibold mb-4">Controles</h3>
          <div id="ctrlList" class="space-y-2">${(p.controles || []).map(c => `<div class="flex gap-2 ri"><input type="text" value="${c}" class="input-field cin flex-1" /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addCtrl" class="btn-secondary text-sm mt-3">+ Control</button>
        </div>

        <div class="card"><h3 class="font-semibold mb-4">Tratamientos</h3>
          <div id="tratList" class="space-y-3">${(p.tratamientos || []).map((t, i) => `
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg ti">
              <select class="input-field ttipo" style="width:auto">${Object.entries(TREATMENT_TYPES).map(([k, v]) => `<option value="${k}" ${t.tipo === k ? 'selected' : ''}>${v.icon} ${v.name}</option>`).join('')}</select>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" class="taplica" ${t.aplica === true || t.aplica === 'true' ? 'checked' : ''} /> Aplica</label>
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" class="treg" ${t.registro?.length ? 'checked' : ''} /> Registro</label>
              <button type="button" class="text-red-500 hover:text-red-700 rx">✕</button>
            </div>`).join('')}</div>
          <button type="button" id="addTrat" class="btn-secondary text-sm mt-3">+ Tratamiento</button>
        </div>

        <div class="card"><h3 class="font-semibold mb-4">Documentación Requerida</h3>
          <div id="docList" class="space-y-2">${(p.documentacion || []).map(d => `<div class="flex gap-2 ri"><input type="text" value="${d}" class="input-field din flex-1" /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addDoc" class="btn-secondary text-sm mt-3">+ Documento</button>
        </div>

        <div class="card"><h3 class="font-semibold mb-4">Checklist de Exportación</h3>
          <div id="ckList" class="space-y-2">${(p.checklist_exportacion || []).map(c => `<div class="flex gap-2 ri"><input type="text" value="${c}" class="input-field ckin flex-1" placeholder="☐ Ítem..." /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addCk" class="btn-secondary text-sm mt-3">+ Ítem Checklist</button>
        </div>

        <div class="card"><h3 class="font-semibold mb-4">Observaciones</h3>
          <div class="space-y-4">
            <div><label class="label">Observaciones</label><textarea id="fObs" class="input-field" rows="2">${p.observaciones || ''}</textarea></div>
            <div><label class="label">Restricciones Especiales</label><textarea id="fRest" class="input-field" rows="2">${p.restricciones_especiales || ''}</textarea></div>
          </div>
        </div>

        <div class="flex justify-between">
          <button type="button" id="cancelBtn" class="btn-secondary">Cancelar</button>
          <button type="submit" class="btn-success">${isEdit ? 'Actualizar' : 'Crear Protocolo'}</button>
        </div>
      </form>
    </div>`;

  const backToList = () => { if (p.pais) renderCountry(container, user, p.pais); else renderList(container, user); };
  document.getElementById('backForm')?.addEventListener('click', backToList);
  document.getElementById('cancelBtn')?.addEventListener('click', backToList);

  const addListItem = (listId, inputClass, placeholder) => {
    const list = document.getElementById(listId);
    const div = document.createElement('div');
    div.className = 'flex gap-2 ri';
    div.innerHTML = `<input type="text" class="input-field ${inputClass} flex-1" placeholder="${placeholder}" /><button type="button" class="btn-danger text-sm rx">✕</button>`;
    list.appendChild(div);
    div.querySelector('.rx').addEventListener('click', () => div.remove());
    div.querySelector('input').focus();
  };

  document.getElementById('addReq')?.addEventListener('click', () => addListItem('reqList', 'rin', 'Requisito...'));
  document.getElementById('addCtrl')?.addEventListener('click', () => addListItem('ctrlList', 'cin', 'Control...'));
  document.getElementById('addDoc')?.addEventListener('click', () => addListItem('docList', 'din', 'Documento...'));
  document.getElementById('addCk')?.addEventListener('click', () => addListItem('ckList', 'ckin', '☐ Ítem...'));
  document.getElementById('addDesc')?.addEventListener('click', () => addListItem('descList', 'descin', 'Párrafo descriptivo...'));

  document.getElementById('addTrat')?.addEventListener('click', () => {
    const list = document.getElementById('tratList');
    const div = document.createElement('div');
    div.className = 'flex items-center gap-3 p-3 bg-gray-50 rounded-lg ti';
    div.innerHTML = `<select class="input-field ttipo" style="width:auto">${Object.entries(TREATMENT_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join('')}</select><label class="flex items-center gap-1 text-sm"><input type="checkbox" class="taplica" checked /> Aplica</label><label class="flex items-center gap-1 text-sm"><input type="checkbox" class="treg" checked /> Registro</label><button type="button" class="text-red-500 hover:text-red-700 rx">✕</button>`;
    list.appendChild(div);
    div.querySelector('.rx').addEventListener('click', () => div.remove());
  });

  body.querySelectorAll('.rx').forEach(b => b.addEventListener('click', () => b.closest('.ri, .ti')?.remove()));

  document.getElementById('fProducto')?.addEventListener('change', (e) => {
    const vars = SAG_VARIETIES[e.target.value] || [];
    document.getElementById('varsBox').innerHTML = vars.map(v => `<label class="flex items-center gap-1 text-sm bg-gray-100 px-2 py-1 rounded cursor-pointer hover:bg-gray-200"><input type="checkbox" name="variedad" value="${v}" class="var-chk" />${v}</label>`).join('');
  });

  document.getElementById('protoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      pais: body.querySelector('#fPais').value,
      codigo_pais: SAG_COUNTRIES.find(c => c.name === body.querySelector('#fPais').value)?.codigo || '',
      organismo_destino: body.querySelector('#fOrganismo').value,
      objetivo: body.querySelector('#fObjetivo')?.value || '',
      descripcion_protocolo: Array.from(document.querySelectorAll('#descList .descin')).map(i => i.value.trim()).filter(Boolean),
      producto: body.querySelector('#fProducto').value,
      variedades: Array.from(body.querySelectorAll('.var-chk:checked')).map(c => c.value),
      categoria_SDP: body.querySelector('#fCategoria').value,
      requisitos: Array.from(body.querySelectorAll('.rin')).map(i => i.value.trim()).filter(Boolean),
      controles: Array.from(body.querySelectorAll('.cin')).map(i => i.value.trim()).filter(Boolean),
      tratamientos: Array.from(body.querySelectorAll('.ti')).map(el => ({ tipo: el.querySelector('.ttipo').value, aplica: el.querySelector('.taplica').checked, registro: el.querySelector('.treg').checked ? (TREATMENT_TYPES[el.querySelector('.ttipo').value]?.registro || []) : [] })),
      documentacion: Array.from(body.querySelectorAll('.din')).map(i => i.value.trim()).filter(Boolean),
      checklist_exportacion: Array.from(body.querySelectorAll('.ckin')).map(i => i.value.trim()).filter(Boolean),
      observaciones: body.querySelector('#fObs').value,
      restricciones_especiales: body.querySelector('#fRest').value,
      vigente: body.querySelector('#fVigente').checked,
      version: p.version || '1.0',
      fecha_actualizacion: new Date().toISOString(),
    };
    try {
      if (isEdit) await updateProtocol(p.id, data);
      else await createProtocol(data);
      if (data.pais) renderCountry(container, user, data.pais);
      else renderList(container, user);
    } catch (err) { alert('Error: ' + err.message); }
  });
}
