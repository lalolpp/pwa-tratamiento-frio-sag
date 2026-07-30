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
    <div class="min-h-screen fade-in-up">
      <nav class="glass-nav sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <a href="#/" class="text-white/50 hover:text-white/80 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </a>
            <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span class="font-bold text-white">Administrador Protocolos SAG</span>
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
  body.innerHTML = '<div class="text-center py-12 text-white/50">Cargando...</div>';

  try {
    const [stats, countries] = await Promise.all([getProtocolStats(), getCountriesSummary()]);
    body.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div class="stat-card text-center"><p class="text-3xl font-bold text-blue-400">${stats.total}</p><p class="text-sm text-white/50">Total</p></div>
        <div class="stat-card text-center"><p class="text-3xl font-bold text-green-400">${stats.active}</p><p class="text-sm text-white/50">Vigentes</p></div>
        <div class="stat-card text-center"><p class="text-3xl font-bold text-red-400">${stats.inactive}</p><p class="text-sm text-white/50">No Vigentes</p></div>
        <div class="stat-card text-center"><p class="text-3xl font-bold text-purple-400">${stats.countries}</p><p class="text-sm text-white/50">Países</p></div>
        <div class="stat-card text-center"><p class="text-3xl font-bold text-indigo-400">${stats.products}</p><p class="text-sm text-white/50">Productos</p></div>
      </div>
      <div class="glass-card-static mb-8"><h2 class="text-lg font-semibold mb-4 text-white">Categorías Fitossanitarias SDP</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${Object.entries(SDP_CATEGORIES).map(([k, c]) => `
            <div class="p-4 rounded-lg border-2 ${k === 'A' ? 'border-green-500/30' : k === 'B' ? 'border-yellow-500/30' : 'border-red-500/30'}" style="background: ${k === 'A' ? 'rgba(34,197,94,0.08)' : k === 'B' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'}">
              <div class="flex items-center gap-2 mb-2"><span class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${k === 'A' ? 'bg-green-500' : k === 'B' ? 'bg-yellow-500' : 'bg-red-500'}">${k}</span><span class="font-semibold text-white">${c.name}</span></div>
              <p class="text-sm text-white/60">${c.description}</p>
              <p class="text-xs mt-2 ${c.treatmentRequired ? 'text-red-400 font-medium' : 'text-green-400'}">${c.treatmentRequired ? 'Requiere tratamiento' : 'Sin tratamiento'}</p>
            </div>`).join('')}
        </div>
      </div>
      <h2 class="text-lg font-semibold mb-4 text-white">Protocolos por País Destino</h2>
      ${countries.length === 0 ? `<div class="glass-card-static text-center py-8"><p class="text-white/50 mb-4">No hay protocolos</p><button id="seedBtn2" class="btn-primary">Cargar Protocolos Iniciales</button></div>` :
      `<div class="space-y-3">${countries.map(c => {
        const info = SAG_COUNTRIES.find(sc => sc.name === c.pais);
        const pests = QUARANTINE_PESTS[info?.id] || [];
        return `<div class="glass-card cursor-pointer country-card" data-country="${c.pais}">
          <div class="flex items-start justify-between">
            <div><div class="flex items-center gap-3 mb-2"><h3 class="text-lg font-bold text-white">${c.pais}</h3>${info?.organism ? `<span class="text-xs px-2 py-1 rounded text-white/60" style="background: rgba(148,163,184,0.15)">${info.organism}</span>` : ''}</div>
            <div class="flex flex-wrap gap-2 mb-2">${c.products.map(p => `<span class="badge-success text-xs">${p}</span>`).join('')}</div>
            <p class="text-sm text-white/50">${c.active} vigente(s) de ${c.total} · ${pests.length} plagas cuarentenarias</p></div>
            <svg class="w-5 h-5 text-white/50 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div></div>`;
      }).join('')}</div>`}`;

    document.getElementById('seedBtn')?.addEventListener('click', async () => { const r = await seedInitialProtocols(); alert(`${r.seeded} protocolos cargados`); await renderList(container, user); });
    document.getElementById('seedBtn2')?.addEventListener('click', async () => { const r = await seedInitialProtocols(); alert(`${r.seeded} protocolos cargados`); await renderList(container, user); });
    document.getElementById('addBtn')?.addEventListener('click', () => { editingProtocol = getDefaultProtocolTemplate(); renderForm(container, user); });
    body.querySelectorAll('.country-card').forEach(c => c.addEventListener('click', () => renderCountry(container, user, c.dataset.country)));
  } catch (e) { body.innerHTML = `<div class="glass-card-static text-red-400 py-8 text-center">${e.message}</div>`; }
}

async function renderCountry(container, user, country) {
  const body = container.querySelector('#adminBody');
  const hdr = container.querySelector('#headerActions');
    hdr.innerHTML = `<button id="backBtn" class="btn-secondary text-sm">← Volver</button><div class="flex gap-2"><button id="exportCountryPDF" class="btn-secondary text-sm flex items-center gap-1">📄 PDF</button><button id="exportCountryXLSX" class="btn-secondary text-sm flex items-center gap-1">📊 XLSX</button></div>`;
  body.innerHTML = '<div class="text-center py-12 text-white/50">Cargando...</div>';

  try {
    const all = await getAllProtocols();
    const protos = all.filter(p => p.pais === country);
    const info = SAG_COUNTRIES.find(c => c.name === country);
    const pests = QUARANTINE_PESTS[info?.id] || [];

    body.innerHTML = `
      <div class="mb-6"><button id="backBtn2" class="text-white/50 hover:text-white/80 transition-colors text-sm mb-2">← Volver</button>
        <div class="flex items-center gap-3"><h2 class="text-2xl font-bold text-white">${country}</h2>${info?.organism ? `<span class="px-3 py-1 rounded-full text-sm text-white/70" style="background: rgba(59,130,246,0.12)">${info.organism}</span>` : ''}</div>
        <p class="text-white/50 mt-1">${protos.length} protocolo(s)</p></div>
      ${pests.length > 0 ? `<div class="glass-card-static mb-6 border-l-4 border-red-500"><h3 class="font-semibold text-red-400 mb-2">Plagas Cuarentenarias</h3><div class="flex flex-wrap gap-2">${pests.map(p => `<span class="px-2 py-1 rounded text-sm text-red-300" style="background: rgba(239,68,68,0.12)">${p}</span>`).join('')}</div></div>` : ''}
      ${protos.length === 0 ? `<div class="glass-card-static text-center py-8"><p class="text-white/50 mb-4">Sin protocolos</p><button class="btn-primary add-for-country" data-p="${country}">+ Agregar</button></div>` :
      `<div class="space-y-4">${protos.map(proto => `
        <div class="glass-card-static">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold text-white">${proto.producto}</h3>
              ${proto.familia ? `<span class="text-xs px-2 py-0.5 rounded text-white/70" style="background: rgba(99,102,241,0.12)">${proto.familia}</span>` : ''}
              <span class="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs ${proto.categoria_SDP === 'A' ? 'bg-green-500' : proto.categoria_SDP === 'B' ? 'bg-yellow-500' : 'bg-red-500'}">${proto.categoria_SDP || 'B'}</span>
              ${proto.vigente ? '<span class="badge-success">Vigente</span>' : '<span class="badge-danger">No Vigente</span>'}
            </div>
            <div class="flex gap-2"><button class="text-blue-400 hover:underline text-sm export-pdf" data-id="${proto.id}">PDF</button><button class="text-blue-400 hover:underline text-sm export-xlsx" data-id="${proto.id}">XLSX</button><button class="text-blue-400 hover:underline text-sm edit-proto" data-id="${proto.id}">Editar</button><button class="text-red-400 hover:underline text-sm del-proto" data-id="${proto.id}">Eliminar</button></div>
          </div>
          ${proto.variedades?.length ? `<div class="mb-2"><span class="text-xs text-white/50 uppercase">Variedades:</span><div class="flex flex-wrap gap-1 mt-1">${proto.variedades.map(v => `<span class="px-2 py-0.5 rounded text-xs text-white/70" style="background: rgba(148,163,184,0.12)">${v}</span>`).join('')}</div></div>` : ''}
          ${proto.requisitos?.length ? `<div class="mb-2"><span class="text-xs text-white/50 uppercase">Requisitos:</span><ul class="mt-1 space-y-1">${proto.requisitos.map(r => `<li class="text-sm text-white/70 flex items-start gap-2"><svg class="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>${r}</li>`).join('')}</ul></div>` : ''}
          ${proto.tratamientos?.length ? `<div class="mb-2"><span class="text-xs text-white/50 uppercase">Tratamientos:</span><div class="flex flex-wrap gap-2 mt-1">${proto.tratamientos.map(t => { const ti = TREATMENT_TYPES[t.tipo] || { name: t.tipo, icon: '📋' }; return `<span class="px-2 py-1 rounded text-sm text-blue-300" style="background: rgba(59,130,246,0.12)">${ti.icon} ${ti.name}</span>`; }).join('')}</div></div>` : ''}
          ${proto.documentacion?.length ? `<div class="mb-2"><span class="text-xs text-white/50 uppercase">Documentación:</span><div class="flex flex-wrap gap-1 mt-1">${proto.documentacion.map(d => `<span class="px-2 py-0.5 rounded text-xs text-purple-300" style="background: rgba(168,85,247,0.12)">${d}</span>`).join('')}</div></div>` : ''}
          ${proto.checklist_exportacion?.length ? `<div class="mb-2"><span class="text-xs text-white/50 uppercase">Checklist Exportación:</span><div class="mt-1 space-y-0.5">${proto.checklist_exportacion.map(c => `<p class="text-sm text-white/70">${c}</p>`).join('')}</div></div>` : ''}
          ${proto.registros_obligatorios?.length ? `<div class="mb-2"><span class="text-xs text-white/50 uppercase">Registros Obligatorios:</span><div class="mt-1 space-y-1">${proto.registros_obligatorios.map(r => `<div class="text-sm text-white/70"><span class="font-medium">${r.tipo}:</span> <span class="text-white/50">${(r.campos || []).join(', ')}</span></div>`).join('')}</div></div>` : ''}
          ${proto.observaciones ? `<p class="text-xs text-white/30 mt-2 italic">${proto.observaciones}</p>` : ''}
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
  } catch (e) { body.innerHTML = `<div class="glass-card-static text-red-400 py-8 text-center">${e.message}</div>`; }
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
      <h2 class="text-xl font-bold mb-6 text-white">${isEdit ? 'Editar Protocolo' : 'Nuevo Protocolo SAG'}</h2>
      <form id="protoForm" class="space-y-6">
        <div class="glass-card-static"><h3 class="font-semibold mb-4 text-white">Información General</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label class="label">País Destino *</label><select id="fPais" class="glass-input" required>${SAG_COUNTRIES.map(c => `<option value="${c.name}" ${p.pais === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
            <div><label class="label">Producto *</label><select id="fProducto" class="glass-input" required><option value="">Seleccionar...</option>${productOptions}</select></div>
            <div><label class="label">Categoría SDP *</label><select id="fCategoria" class="glass-input" required>${Object.entries(SDP_CATEGORIES).map(([k, c]) => `<option value="${k}" ${p.categoria_SDP === k ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
          </div>
          <div class="mt-4"><label class="label">Variedades</label><div id="varsBox" class="flex flex-wrap gap-2 mt-1">${(SAG_VARIETIES[p.producto] || []).map(v => `<label class="flex items-center gap-1 text-sm px-2 py-1 rounded cursor-pointer text-white/70" style="background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.2);"><input type="checkbox" name="variedad" value="${v}" ${(p.variedades || []).includes(v) ? 'checked' : ''} class="var-chk" />${v}</label>`).join('')}</div></div>
          <div class="mt-4"><label class="label">Organismo Destino</label><input type="text" id="fOrganismo" class="glass-input" value="${p.organismo_destino || ''}" placeholder="Ej: GACC, USDA-APHIS..." /></div>
          <div class="mt-4"><label class="label">Objetivo del Protocolo</label><textarea id="fObjetivo" class="glass-input" rows="2" placeholder="Descripción del objetivo...">${p.objetivo || ''}</textarea></div>
          <div class="mt-4"><label class="label">Descripción del Protocolo</label><div id="descList" class="space-y-2">${(p.descripcion_protocolo || []).map(d => `<div class="flex gap-2 ri"><input type="text" value="${d}" class="glass-input descin flex-1" placeholder="Párrafo descriptivo..." /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div><button type="button" id="addDesc" class="btn-secondary text-sm mt-3">+ Párrafo</button></div>
          <div class="mt-4"><label class="flex items-center gap-2"><input type="checkbox" id="fVigente" ${p.vigente !== false ? 'checked' : ''} /><span class="text-sm font-medium text-white/70">Vigente</span></label></div>
        </div>

        <div class="glass-card-static"><h3 class="font-semibold mb-4 text-white">Requisitos</h3>
          <div id="reqList" class="space-y-2">${(p.requisitos || []).map(r => `<div class="flex gap-2 ri"><input type="text" value="${r}" class="glass-input rin flex-1" /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addReq" class="btn-secondary text-sm mt-3">+ Requisito</button>
        </div>

        <div class="glass-card-static"><h3 class="font-semibold mb-4 text-white">Controles</h3>
          <div id="ctrlList" class="space-y-2">${(p.controles || []).map(c => `<div class="flex gap-2 ri"><input type="text" value="${c}" class="glass-input cin flex-1" /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addCtrl" class="btn-secondary text-sm mt-3">+ Control</button>
        </div>

        <div class="glass-card-static"><h3 class="font-semibold mb-4 text-white">Tratamientos</h3>
          <div id="tratList" class="space-y-3">${(p.tratamientos || []).map((t, i) => `
            <div class="flex items-center gap-3 p-3 rounded-lg ti" style="background: rgba(148,163,184,0.06); border: 1px solid rgba(148,163,184,0.1);">
              <select class="glass-input ttipo" style="width:auto">${Object.entries(TREATMENT_TYPES).map(([k, v]) => `<option value="${k}" ${t.tipo === k ? 'selected' : ''}>${v.icon} ${v.name}</option>`).join('')}</select>
              <label class="flex items-center gap-1 text-sm text-white/70"><input type="checkbox" class="taplica" ${t.aplica === true || t.aplica === 'true' ? 'checked' : ''} /> Aplica</label>
              <label class="flex items-center gap-1 text-sm text-white/70"><input type="checkbox" class="treg" ${t.registro?.length ? 'checked' : ''} /> Registro</label>
              <button type="button" class="text-red-400 hover:text-red-300 rx">✕</button>
            </div>`).join('')}</div>
          <button type="button" id="addTrat" class="btn-secondary text-sm mt-3">+ Tratamiento</button>
        </div>

        <div class="glass-card-static"><h3 class="font-semibold mb-4 text-white">Documentación Requerida</h3>
          <div id="docList" class="space-y-2">${(p.documentacion || []).map(d => `<div class="flex gap-2 ri"><input type="text" value="${d}" class="glass-input din flex-1" /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addDoc" class="btn-secondary text-sm mt-3">+ Documento</button>
        </div>

        <div class="glass-card-static"><h3 class="font-semibold mb-4 text-white">Checklist de Exportación</h3>
          <div id="ckList" class="space-y-2">${(p.checklist_exportacion || []).map(c => `<div class="flex gap-2 ri"><input type="text" value="${c}" class="glass-input ckin flex-1" placeholder="☐ Ítem..." /><button type="button" class="btn-danger text-sm rx">✕</button></div>`).join('')}</div>
          <button type="button" id="addCk" class="btn-secondary text-sm mt-3">+ Ítem Checklist</button>
        </div>

        <div class="glass-card-static"><h3 class="font-semibold mb-4 text-white">Observaciones</h3>
          <div class="space-y-4">
            <div><label class="label">Observaciones</label><textarea id="fObs" class="glass-input" rows="2">${p.observaciones || ''}</textarea></div>
            <div><label class="label">Restricciones Especiales</label><textarea id="fRest" class="glass-input" rows="2">${p.restricciones_especiales || ''}</textarea></div>
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
    div.innerHTML = `<input type="text" class="glass-input ${inputClass} flex-1" placeholder="${placeholder}" /><button type="button" class="btn-danger text-sm rx">✕</button>`;
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
    div.className = 'flex items-center gap-3 p-3 rounded-lg ti';
    div.style.background = 'rgba(148,163,184,0.06)';
    div.style.border = '1px solid rgba(148,163,184,0.1)';
    div.innerHTML = `<select class="glass-input ttipo" style="width:auto">${Object.entries(TREATMENT_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join('')}</select><label class="flex items-center gap-1 text-sm text-white/70"><input type="checkbox" class="taplica" checked /> Aplica</label><label class="flex items-center gap-1 text-sm text-white/70"><input type="checkbox" class="treg" checked /> Registro</label><button type="button" class="text-red-400 hover:text-red-300 rx">✕</button>`;
    list.appendChild(div);
    div.querySelector('.rx').addEventListener('click', () => div.remove());
  });

  body.querySelectorAll('.rx').forEach(b => b.addEventListener('click', () => b.closest('.ri, .ti')?.remove()));

  document.getElementById('fProducto')?.addEventListener('change', (e) => {
    const vars = SAG_VARIETIES[e.target.value] || [];
    document.getElementById('varsBox').innerHTML = vars.map(v => `<label class="flex items-center gap-1 text-sm px-2 py-1 rounded cursor-pointer text-white/70" style="background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.2);"><input type="checkbox" name="variedad" value="${v}" class="var-chk" />${v}</label>`).join('');
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
