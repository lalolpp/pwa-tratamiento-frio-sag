import { renderLogin } from '../views/login.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderNewEvaluation } from '../views/newEvaluation.js';
import { renderEvaluationResult } from '../views/evaluationResult.js';
import { renderHistory } from '../views/history.js';
import { renderChecklist } from '../views/checklist.js';
import { renderSagAdmin } from '../views/admin/sagAdmin.js';
import { renderChambers } from '../views/admin/chambers.js';
import { renderDocumentacionTecnica } from '../views/admin/documentacionTecnica.js';

const routes = {
  '/login': renderLogin,
  '/': renderDashboard,
  '/nueva-evaluacion': renderNewEvaluation,
  '/evaluacion': renderEvaluationResult,
  '/historial': renderHistory,
  '/checklist': renderChecklist,
  '/admin/protocolos-sag': renderSagAdmin,
  '/admin/camaras': renderChambers,
  '/admin/documentacion-tecnica': renderDocumentacionTecnica,
};

export function initRouter(appEl) {
  function navigate() {
    const fullHash = window.location.hash.slice(1) || '/';
    const path = fullHash.split('?')[0];
    const handler = routes[path] || routes['/'];
    handler(appEl);
  }

  window.addEventListener('hashchange', navigate);
  navigate();
}

export function navigateTo(path) {
  window.location.hash = path;
}
