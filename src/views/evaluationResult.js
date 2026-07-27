import { requireAuth } from '../auth/authGuard.js';
import { db } from '../config/firebase.js';
import { doc, getDoc } from 'firebase/firestore';

export function renderEvaluationResult(container) {
  requireAuth(async (user) => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const evalId = params.get('id');

    if (!evalId) {
      container.innerHTML = `
        <div class="min-h-screen flex items-center justify-center">
          <div class="text-center">
            <p class="text-white/50 mb-4">No se especificó una evaluación</p>
            <a href="#/" class="btn-primary">Volver al Dashboard</a>
          </div>
        </div>
      `;
      return;
    }

    try {
      const evalDoc = await getDoc(doc(db, 'evaluations', evalId));

      if (!evalDoc.exists()) {
        container.innerHTML = `
          <div class="min-h-screen flex items-center justify-center">
            <div class="text-center">
              <p class="text-white/50 mb-4">Evaluación no encontrada</p>
              <a href="#/" class="btn-primary">Volver al Dashboard</a>
            </div>
          </div>
        `;
        return;
      }

      const data = evalDoc.data();
      renderResult(container, data);
    } catch (error) {
      console.error('Error loading evaluation:', error);
      container.innerHTML = `
        <div class="min-h-screen flex items-center justify-center">
          <div class="text-center">
            <p class="text-red-400 mb-4">Error al cargar la evaluación</p>
            <a href="#/" class="btn-primary">Volver al Dashboard</a>
          </div>
        </div>
      `;
    }
  });
}

function renderResult(container, evalData) {
  const result = evalData.result;
  const meta = evalData.data?.metadata || {};
  const protocol = evalData.protocol || {};
  const isApproved = result?.status === 'aprobado';

  container.innerHTML = `
    <div class="min-h-screen">
      <nav class="glass-nav sticky top-0 z-50">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center h-16 gap-4">
            <a href="#/" class="text-white/50 hover:text-white/80 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
            <span class="font-semibold text-white">Detalle de Evaluación</span>
          </div>
        </div>
      </nav>

      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="glass-card-static fade-in-up">
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
            <p class="text-white/50 mt-1">${result?.summary || ''}</p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div class="meta-card">
              <span class="text-white/50 block">Cámara</span>
              <span class="font-semibold text-white">${meta.cameraName || '-'}</span>
            </div>
            <div class="meta-card">
              <span class="text-white/50 block">Producto</span>
              <span class="font-semibold text-white">${meta.product || '-'} ${meta.variety || ''}</span>
            </div>
            <div class="meta-card">
              <span class="text-white/50 block">Destino</span>
              <span class="font-semibold text-white">${meta.destinationCountry || '-'}</span>
            </div>
            <div class="meta-card">
              <span class="text-white/50 block">Lote</span>
              <span class="font-semibold text-white">${meta.lotCode || '-'}</span>
            </div>
          </div>

          ${protocol ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div class="meta-card-blue">
              <span class="text-blue-400 block">Protocolo</span>
              <span class="font-semibold text-white">${protocol.pais || '-'}</span>
            </div>
            <div class="meta-card-blue">
              <span class="text-blue-400 block">Categoría SDP</span>
              <span class="font-semibold text-white">${protocol.categoria_SDP || '-'}</span>
            </div>
            ${protocol.familia ? `
            <div class="meta-card-indigo">
              <span class="text-indigo-400 block">Familia</span>
              <span class="font-semibold text-white">${protocol.familia}</span>
            </div>` : ''}
            ${protocol.organismo_destino ? `
            <div class="meta-card">
              <span class="text-white/50 block">Organismo</span>
              <span class="font-semibold text-xs text-white">${protocol.organismo_destino}</span>
            </div>` : ''}
          </div>
          ${protocol.objetivo ? `
          <div class="mb-4 p-3 rounded-xl" style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.15);">
            <h4 class="text-sm font-semibold text-blue-400 mb-1">Objetivo</h4>
            <p class="text-sm text-white/70">${protocol.objetivo}</p>
          </div>` : ''}
          ${protocol.descripcion_protocolo?.length ? `
          <div class="mb-4 space-y-1">
            ${protocol.descripcion_protocolo.map(d => `<p class="text-sm text-white/60">${d}</p>`).join('')}
          </div>` : ''}
          ${protocol.requisitos?.length ? `
          <div class="mb-4"><h4 class="text-sm font-semibold text-white/70 mb-2">Requisitos del Protocolo</h4>
            <ul class="space-y-1">${protocol.requisitos.map(r => `<li class="text-sm flex items-start gap-2 text-white/60"><svg class="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>${r}</li>`).join('')}</ul>
          </div>` : ''}
          ${protocol.checklist_exportacion?.length ? `
          <div class="mb-4"><h4 class="text-sm font-semibold text-white/70 mb-2">Checklist Exportación</h4>
            <div class="space-y-1">${protocol.checklist_exportacion.map(c => `<p class="text-sm text-white/60">${c}</p>`).join('')}</div>
          </div>` : ''}
          ` : ''}

          <h3 class="font-semibold mb-3 text-white">Validaciones</h3>
          <div class="space-y-3 mb-6">
            ${(result?.validations || []).map(v => `
              <div class="flex items-start gap-3 p-3 rounded-xl ${v.status === 'cumple' ? 'validation-pass' : v.status === 'no_cumple' ? 'validation-fail' : 'validation-info'} fade-in-up">
                <div class="flex-shrink-0 mt-0.5">
                  ${v.status === 'cumple'
                    ? '<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
                    : '<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
                  }
                </div>
                <div>
                  <span class="font-medium ${v.status === 'cumple' ? 'text-green-300' : 'text-red-300'}">${v.name}</span>
                  <p class="text-sm ${v.status === 'cumple' ? 'text-green-400/70' : 'text-red-400/70'}">${v.detail}</p>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="flex justify-between mt-8">
            <a href="#/" class="btn-secondary">Volver al Dashboard</a>
            <a href="#/nueva-evaluacion" class="btn-primary">Nueva Evaluación</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
