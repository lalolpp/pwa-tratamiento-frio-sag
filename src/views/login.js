import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #1e40af 70%, #2563eb 100%);">
      <!-- Decorative elements -->
      <div class="fixed inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-20" style="background: radial-gradient(circle, #3b82f6, transparent);"></div>
        <div class="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-15" style="background: radial-gradient(circle, #60a5fa, transparent);"></div>
      </div>

      <div class="w-full max-w-md relative z-10 fade-in-up">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 scale-in" style="background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 8px 30px rgba(59,130,246,0.4);">
            <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          </div>
          <h1 class="text-3xl font-bold text-white">Evaluador de Tratamientos de Frío</h1>
          <p class="text-white/50 mt-2">Programa Origen — SAG</p>
        </div>

        <div class="glass-card-static" style="padding: 2rem;">
          <form id="loginForm" class="space-y-5">
            <div>
              <label class="label">Correo electrónico</label>
              <input type="email" id="email" class="glass-input" placeholder="usuario@empresa.cl" required />
            </div>
            <div>
              <label class="label">Contraseña</label>
              <input type="password" id="password" class="glass-input" placeholder="••••••••" required />
            </div>
            <div id="error-message" class="hidden text-sm p-3 rounded-xl" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171;"></div>
            <button type="submit" id="loginBtn" class="btn-primary w-full flex items-center justify-center gap-2">
              <span>Iniciar Sesión</span>
            </button>
          </form>
        </div>

        <p class="text-center text-white/30 text-xs mt-6">
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
