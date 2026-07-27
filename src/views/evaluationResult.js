import { requireAuth } from '../auth/authGuard.js';
import { db } from '../config/firebase.js';
import { doc, getDoc } from 'firebase/firestore';

export function renderEvaluationResult(container) {
  requireAuth(async (user) => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const evalId = params.get('id');

    if (!evalId) {
      container.innerHTML = `
        <div class="min-h-screen bg-gray-50 flex items-center justify-center">
          <div class="text-center">
            <p class="text-gray-500 mb-4">No se especificó una evaluación</p>
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
          <div class="min-h-screen bg-gray-50 flex items-center justify-center">
            <div class="text-center">
              <p class="text-gray-500 mb-4">Evaluación no encontrada</p>
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
        <div class="min-h-screen bg-gray-50 flex items-center justify-center">
          <div class="text-center">
            <p class="text-danger mb-4">Error al cargar la evaluación</p>
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
    <div class="min-h-screen bg-gray-50">
      <nav class="bg-white shadow-sm border-b">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center h-16 gap-4">
            <a href="#/" class="text-gray-500 hover:text-gray-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
            <span class="font-semibold">Detalle de Evaluación</span>
          </div>
        </div>
      </nav>

      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="card">
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
            <p class="text-gray-500 mt-1">${result?.summary || ''}</p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div class="bg-gray-50 p-3 rounded-lg">
              <span class="text-gray-500 block">Camara</span>
              <span class="font-semibold">${meta.cameraName || '-'}</span>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
              <span class="text-gray-500 block">Producto</span>
              <span class="font-semibold">${meta.product || '-'} ${meta.variety || ''}</span>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
              <span class="text-gray-500 block">Destino</span>
              <span class="font-semibold">${meta.destinationCountry || '-'}</span>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
              <span class="text-gray-500 block">Lote</span>
              <span class="font-semibold">${meta.lotCode || '-'}</span>
            </div>
          </div>

          ${protocol ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div class="bg-blue-50 p-3 rounded-lg">
              <span class="text-blue-600 block">Protocolo</span>
              <span class="font-semibold">${protocol.pais || '-'}</span>
            </div>
            <div class="bg-blue-50 p-3 rounded-lg">
              <span class="text-blue-600 block">Categoría SDP</span>
              <span class="font-semibold">${protocol.categoria_SDP || '-'}</span>
            </div>
            ${protocol.familia ? `
            <div class="bg-indigo-50 p-3 rounded-lg">
              <span class="text-indigo-600 block">Familia</span>
              <span class="font-semibold">${protocol.familia}</span>
            </div>` : ''}
            ${protocol.organismo_destino ? `
            <div class="bg-gray-50 p-3 rounded-lg">
              <span class="text-gray-500 block">Organismo</span>
              <span class="font-semibold text-xs">${protocol.organismo_destino}</span>
            </div>` : ''}
          </div>
          ${protocol.objetivo ? `
          <div class="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 class="text-sm font-semibold text-blue-700 mb-1">Objetivo</h4>
            <p class="text-sm text-blue-800">${protocol.objetivo}</p>
          </div>` : ''}
          ${protocol.descripcion_protocolo?.length ? `
          <div class="mb-4 space-y-1">
            ${protocol.descripcion_protocolo.map(d => `<p class="text-sm text-gray-600">${d}</p>`).join('')}
          </div>` : ''}
          ${protocol.requisitos?.length ? `
          <div class="mb-4"><h4 class="text-sm font-semibold text-gray-600 mb-2">Requisitos del Protocolo</h4>
            <ul class="space-y-1">${protocol.requisitos.map(r => `<li class="text-sm flex items-start gap-2"><svg class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>${r}</li>`).join('')}</ul>
          </div>` : ''}
          ${protocol.checklist_exportacion?.length ? `
          <div class="mb-4"><h4 class="text-sm font-semibold text-gray-600 mb-2">Checklist Exportación</h4>
            <div class="space-y-1">${protocol.checklist_exportacion.map(c => `<p class="text-sm">${c}</p>`).join('')}</div>
          </div>` : ''}
          ` : ''}

          <h3 class="font-semibold mb-3">Validaciones</h3>
          <div class="space-y-3 mb-6">
            ${(result?.validations || []).map(v => `
              <div class="flex items-start gap-3 p-3 rounded-lg ${v.status === 'cumple' ? 'bg-green-50' : 'bg-red-50'}">
                <div class="flex-shrink-0 mt-0.5">
                  ${v.status === 'cumple'
                    ? '<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
                    : '<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
                  }
                </div>
                <div>
                  <span class="font-medium ${v.status === 'cumple' ? 'text-green-800' : 'text-red-800'}">${v.name}</span>
                  <p class="text-sm ${v.status === 'cumple' ? 'text-green-600' : 'text-red-600'}">${v.detail}</p>
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
