const STORAGE_KEY = 'dev_auth_user';
const listeners = {};

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

let currentUser = getStoredUser();

function notifyListeners() {
  Object.values(listeners).forEach(cb => {
    try { cb(currentUser); } catch {}
  });
  // Also sync firebase.js's auth.currentUser getter
  if (window.__mockAuth) {
    window.__mockAuth.currentUser = currentUser;
    Object.values(window.__mockAuth.listeners || {}).forEach(cb => {
      try { cb(currentUser); } catch {}
    });
  }
}

export function onAuthStateChanged(authOrCallback, maybeCallback) {
  const callback = maybeCallback || authOrCallback;
  const id = Math.random().toString(36).slice(2);
  listeners[id] = callback;
  setTimeout(() => callback(currentUser), 30);
  return () => { delete listeners[id]; };
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  if (!email) throw { code: 'auth/invalid-email', message: 'Email inválido' };
  if (!password) throw { code: 'auth/wrong-password', message: 'Contraseña requerida' };
  currentUser = { uid: 'dev-user-001', email, displayName: 'Dev User' };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
  notifyListeners();
  return { user: currentUser };
}

export async function signOut() {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEY);
  notifyListeners();
}
