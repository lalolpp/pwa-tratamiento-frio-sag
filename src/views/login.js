import { hasPin, setPin, verifyPin, unlock, resetPin } from '../auth/localAuth.js';

export function renderLogin(container) {
  const isSetup = !hasPin();

  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #1e40af 70%, #2563eb 100%);">
      <div class="fixed inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-20" style="background: radial-gradient(circle, #3b82f6, transparent);"></div>
        <div class="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-15" style="background: radial-gradient(circle, #60a5fa, transparent);"></div>
      </div>

      <div class="w-full max-w-md relative z-10 fade-in-up">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 scale-in" style="background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 8px 30px rgba(59,130,246,0.4);">
            <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 8a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17h3.839m.88-2c.083-1.161.11-2.34.11-3.5 0-5.5-3.15-10-7.5-10S4.5 6 4.5 11.5c0 1.16.027 2.339.11 3.5m.88 2h3.84a21.88 21.88 0 002.296 2.253"/>
            </svg>
          </div>
          <h1 class="text-3xl font-bold text-white">Evaluador de Tratamientos de Frío</h1>
          <p class="text-white/50 mt-2">Programa Origen — SAG</p>
        </div>

        <div class="glass-card-static" style="padding: 2rem;">
          <form id="pinForm" class="space-y-5">
            <div>
              <label class="label">${isSetup ? 'Crea tu PIN de acceso' : 'Ingresa tu PIN'}</label>
              <input type="password" id="pin" inputmode="numeric" pattern="[0-9]*" class="glass-input text-center text-2xl tracking-[0.5em] letter-spacing" placeholder="••••" maxlength="4" required />
            </div>
            <div id="pinConfirmWrap" class="${isSetup ? '' : 'hidden'}">
              <label class="label">Confirma el PIN</label>
              <input type="password" id="pinConfirm" inputmode="numeric" pattern="[0-9]*" class="glass-input text-center text-2xl tracking-[0.5em]" placeholder="••••" maxlength="4" />
            </div>
            <div id="error-message" class="hidden text-sm p-3 rounded-xl" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171;"></div>
            <button type="submit" id="pinBtn" class="btn-primary w-full flex items-center justify-center gap-2">
              <span>${isSetup ? 'Guardar PIN' : 'Entrar'}</span>
            </button>
          </form>

          <div id="resetWrap" class="text-center mt-4">
            <button id="resetPinBtn" class="text-white/30 hover:text-white/60 text-xs transition-colors">¿Olvidaste tu PIN? Restablecer</button>
          </div>
        </div>

        <p class="text-center text-white/30 text-xs mt-6">
          Pre-auditoría interna de tratamientos de frío
        </p>
      </div>
    </div>
  `;

  const form = document.getElementById('pinForm');
  const errorMsg = document.getElementById('error-message');

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorMsg.classList.add('hidden');

    const pin = document.getElementById('pin').value;

    if (isSetup) {
      const confirm = document.getElementById('pinConfirm').value;
      if (pin.length < 4) return showError('El PIN debe tener 4 dígitos');
      if (pin !== confirm) return showError('Los PIN no coinciden');
      setPin(pin);
    } else {
      if (!verifyPin(pin)) return showError('PIN incorrecto');
    }

    unlock();
    window.location.hash = '#/';
  });

  document.getElementById('resetPinBtn')?.addEventListener('click', () => {
    if (confirm('¿Restablecer el PIN? La app abrirá sin pedir PIN y podrás crear uno nuevo.')) {
      resetPin();
      window.location.hash = '#/login';
    }
  });
}
