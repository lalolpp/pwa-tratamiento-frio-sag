import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900 p-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <svg class="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-white">Evaluador de Tratamientos de Frío</h1>
          <p class="text-primary-200 mt-1">Programa Origen - SAG</p>
        </div>

        <div class="card">
          <form id="loginForm" class="space-y-4">
            <div>
              <label class="label">Correo electrónico</label>
              <input type="email" id="email" class="input-field" placeholder="usuario@empresa.cl" required />
            </div>
            <div>
              <label class="label">Contraseña</label>
              <input type="password" id="password" class="input-field" placeholder="••••••••" required />
            </div>
            <div id="error-message" class="hidden text-sm text-danger bg-red-50 p-3 rounded-lg"></div>
            <button type="submit" id="loginBtn" class="btn-primary w-full flex items-center justify-center gap-2">
              <span>Iniciar Sesión</span>
            </button>
          </form>
        </div>

        <p class="text-center text-primary-200 text-xs mt-6">
          Pre-auditoría interna de tratamientos de frío
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('loginForm');
  const errorMsg = document.getElementById('error-message');
  const loginBtn = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="animate-spin">⏳</span> Ingresando...';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.hash = '#/';
    } catch (error) {
      const messages = {
        'auth/user-not-found': 'Usuario no encontrado',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/too-many-requests': 'Demasiados intentos. Intente más tarde',
      };
      errorMsg.textContent = messages[error.code] || 'Error al iniciar sesión';
      errorMsg.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<span>Iniciar Sesión</span>';
    }
  });
}
