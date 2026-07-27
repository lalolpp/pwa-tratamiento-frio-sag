import { requireAuth } from '../auth/authGuard.js';
import { db } from '../config/firebase.js';
import { collection, query, orderBy, limit, getDocs, startAfter } from 'firebase/firestore';

let lastDoc = null;
const PAGE_SIZE = 20;

export function renderHistory(container) {
  requireAuth(async (user) => {
    container.innerHTML = buildHistoryHTML();
    attachHistoryEvents(container);
    await loadEvaluations(container);
  });
}

function buildHistoryHTML() {
  return `
    <div class="min-h-screen bg-gray-50">
      <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center h-16 gap-4">
            <a href="#/" class="text-gray-500 hover:text-gray-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
            <span class="font-semibold">Historial de Evaluaciones</span>
          </div>
        </div>
      </nav>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="card">
          <div class="flex items-center justify-between mb-6">
            <h1 class="text-xl font-bold">Historial</h1>
            <a href="#/nueva-evaluacion" class="btn-primary text-sm">+ Nueva Evaluación</a>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cámara</th>
                  <th>Producto</th>
                  <th>Variedad</th>
                  <th>País Destino</th>
                  <th>Lote</th>
                  <th>Resultado</th>
                  <th>Evaluado por</th>
                </tr>
              </thead>
              <tbody id="historyBody">
                <tr>
                  <td colspan="8" class="text-center py-8 text-gray-400">Cargando...</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div id="loadMoreContainer" class="hidden mt-4 text-center">
            <button id="loadMoreBtn" class="btn-secondary text-sm">Cargar más</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachHistoryEvents(container) {
  container.querySelector('#loadMoreBtn')?.addEventListener('click', async () => {
    await loadEvaluations(container, true);
  });
}

async function loadEvaluations(container, append = false) {
  try {
    const evaluationsRef = collection(db, 'evaluations');
    let q;

    if (append && lastDoc) {
      q = query(evaluationsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
    } else {
      q = query(evaluationsRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    }

    const snapshot = await getDocs(q);
    const tbody = container.querySelector('#historyBody');

    if (!append) tbody.innerHTML = '';

    if (snapshot.empty && !append) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-gray-400">No hay evaluaciones registradas</td>
        </tr>
      `;
      return;
    }

    if (snapshot.docs.length > 0) {
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const date = data.createdAt?.toDate?.()
        ? data.createdAt.toDate().toLocaleDateString('es-CL')
        : '-';
      const badge = data.result?.status === 'aprobado'
        ? '<span class="badge-success">Aprobado</span>'
        : '<span class="badge-danger">No Aprobado</span>';

      const meta = data.data?.metadata || {};

      const row = document.createElement('tr');
      row.className = 'cursor-pointer';
      row.onclick = () => { window.location.hash = `#/evaluacion?id=${doc.id}`; };
      row.innerHTML = `
        <td>${date}</td>
        <td>${meta.cameraName || '-'}</td>
        <td>${meta.product || '-'}</td>
        <td>${meta.variety || '-'}</td>
        <td>${meta.destinationCountry || '-'}</td>
        <td>${meta.lotCode || '-'}</td>
        <td>${badge}</td>
        <td class="text-xs">${data.userEmail || '-'}</td>
      `;
      tbody.appendChild(row);
    });

    const loadMoreContainer = container.querySelector('#loadMoreContainer');
    if (snapshot.docs.length >= PAGE_SIZE) {
      loadMoreContainer.classList.remove('hidden');
    } else {
      loadMoreContainer.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error loading history:', error);
  }
}
