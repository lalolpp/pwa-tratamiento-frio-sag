const PIN_KEY = 'sag_local_pin';
const SESSION_KEY = 'sag_pin_unlocked';
const LOCAL_USER = { uid: 'local', email: 'Operador SAG' };

export function hasPin() {
  return !!localStorage.getItem(PIN_KEY);
}

export function setPin(pin) {
  localStorage.setItem(PIN_KEY, pin);
}

export function verifyPin(pin) {
  return localStorage.getItem(PIN_KEY) === pin;
}

export function resetPin() {
  localStorage.removeItem(PIN_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function unlock() {
  sessionStorage.setItem(SESSION_KEY, '1');
}

export function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function lock() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser() {
  return isUnlocked() ? { ...LOCAL_USER } : null;
}
