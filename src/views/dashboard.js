import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { requireAuth } from '../auth/authGuard.js';
import { navigateTo } from '../utils/router.js';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase.js';

export function renderDashboard(container) {
  requireAuth(async (user) => {
    container.innerHTML = buildDashboardHTML(user);
    attachDashboardEvents(container, user);
  });
}

function buildDashboardHTML(user) {
  return `
    <div class="min-h-screen">
      <!-- Navbar -->
      <nav class="glass-nav sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 4px 15px rgba(59,130,246,0.3);">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
              </div>
              <span class="font-bold text-white text-lg">EvalFríoSAG</span>
            </div>
            <div class="flex items-center gap-4">
              <span class="text-sm text-white/60">${user.email}</span>
              <button id="logoutBtn" class="text-sm text-white/50 hover:text-white/80 transition-colors duration-200">Salir</button>
            </div>
          </div>
        </div>
      </nav>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8 fade-in-up">
          <div>
            <h1 class="text-3xl font-bold text-white">Dashboard</h1>
            <p class="text-white/50 mt-1">Evaluador de Tratamientos de Frío</p>
          </div>
          <button id="newEvalBtn" class="btn-primary flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Nueva Evaluación
          </button>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          <div class="stat-card fade-in-up stagger-1">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.2);">
                <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <div>
                <p class="text-sm text-white/50">Total Evaluaciones</p>
                <p class="text-2xl font-bold text-white" id="statTotal">-</p>
              </div>
            </div>
          </div>
          <div class="stat-card fade-in-up stagger-2">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.2);">
                <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div>
                <p class="text-sm text-white/50">Aprobadas</p>
                <p class="text-2xl font-bold text-green-400" id="statApproved">-</p>
              </div>
            </div>
          </div>
          <div class="stat-card fade-in-up stagger-3">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.2);">
                <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </div>
              <div>
                <p class="text-sm text-white/50">No Aprobadas</p>
                <p class="text-2xl font-bold text-red-400" id="statRejected">-</p>
              </div>
            </div>
          </div>
          <div class="stat-card fade-in-up stagger-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.2);">
                <svg class="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div>
                <p class="text-sm text-white/50">Pendientes</p>
                <p class="text-2xl font-bold text-yellow-400" id="statPending">-</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Evaluations -->
        <div class="glass-table-card fade-in-up stagger-3">
          <div class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px solid rgba(255,255,255,0.06);">
            <h2 class="text-lg font-semibold text-white">Últimas Evaluaciones</h2>
            <a href="#/historial" class="text-sm text-blue-400 hover:text-blue-300 transition-colors">Ver todo</a>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cámara</th>
                  <th>Producto</th>
                  <th>País Destino</th>
                  <th>Resultado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="recentEvaluations">
                <tr>
                  <td colspan="6" class="text-center py-8 text-white/30">Cargando evaluaciones...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Admin Links -->
        <div class="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <a href="#/checklist" class="glass-card fade-in-up stagger-1 flex items-center gap-4 group">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style="background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.2);">
              <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Checklist Exportación</h3>
              <p class="text-sm text-white/50">Verificar requisitos</p>
            </div>
          </a>
          <a href="#/admin/protocolos-sag" class="glass-card fade-in-up stagger-2 flex items-center gap-4 group">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style="background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.2);">
              <svg class="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Protocolos SAG</h3>
              <p class="text-sm text-white/50">Gestionar protocolos</p>
            </div>
          </a>
          <a href="#/admin/documentacion-tecnica" class="glass-card fade-in-up stagger-3 flex items-center gap-4 group">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style="background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.2);">
              <svg class="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Documentación Técnica</h3>
              <p class="text-sm text-white/50">Convertir documentos</p>
            </div>
          </a>
          <a href="#/admin/camaras" class="glass-card fade-in-up stagger-4 flex items-center gap-4 group">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style="background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.2);">
              <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-white">Cámaras</h3>
              <p class="text-sm text-white/50">Gestionar cámaras</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  `;
}

function attachDashboardEvents(container) {
  document.getElementById('newEvalBtn')?.addEventListener('click', () => {
    navigateTo('/nueva-evaluacion');
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.hash = '#/login';
  });

  loadRecentEvaluations(container);
}

async function loadRecentEvaluations(container) {
  try {
    const evaluationsRef = collection(db, 'evaluations');
    const q = query(evaluationsRef, orderBy('createdAt', 'desc'), limit(5));
    const snapshot = await getDocs(q);

    const tbody = container.querySelector('#recentEvaluations');
    if (!snapshot.empty) {
      tbody.innerHTML = snapshot.docs.map(doc => {
        const data = doc.data();
        const date = data.createdAt?.toDate?.()
          ? data.createdAt.toDate().toLocaleDateString('es-CL')
          : '-';
        const badge = data.result?.status === 'aprobado'
          ? '<span class="badge-success">Aprobado</span>'
          : '<span class="badge-danger">No Aprobado</span>';

        return `
          <tr class="cursor-pointer" onclick="window.location.hash='#/evaluacion?id=${doc.id}'">
            <td>${date}</td>
            <td>${data.data?.metadata?.cameraName || '-'}</td>
            <td>${data.data?.metadata?.product || '-'} ${data.data?.metadata?.variety || ''}</td>
            <td>${data.data?.metadata?.destinationCountry || '-'}</td>
            <td>${badge}</td>
            <td>
              <svg class="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-white/30">
            No hay evaluaciones registradas
          </td>
        </tr>
      `;
    }
  } catch (error) {
    console.error('Error loading evaluations:', error);
  }
}
