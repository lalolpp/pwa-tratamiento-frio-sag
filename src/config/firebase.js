let auth, db, storage;

const isDevMode = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

if (isDevMode) {
  console.warn('[DEV MODE] Firebase no configurado. Usando almacenamiento local.');

  const STORAGE_KEY = 'dev_auth_user';
  const listeners = {};
  let currentUser = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');

  function notifyAuth() {
    Object.values(listeners).forEach(cb => {
      try { cb(currentUser); } catch {}
    });
  }

  auth = {
    get currentUser() { return currentUser; },
  };

  db = { _type: 'mockDb' };

  storage = {
    ref: () => ({ put: async () => ({ ref: { getDownloadURL: async () => '' } }) }),
  };

  window.__DEV_MODE__ = true;
  window.__db = db;
  window.__mockAuth = { currentUser, listeners, notifyAuth, STORAGE_KEY };

} else {
  const { initializeApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const { getFirestore } = await import('firebase/firestore');
  const { getStorage } = await import('firebase/storage');

  const firebaseConfig = {
    apiKey: "AIzaSyAPg-iyrPHhtUk-wbRR-vwZIuIzUxQSxf0",
    authDomain: "tratamiento-de-frio.firebaseapp.com",
    projectId: "tratamiento-de-frio",
    storageBucket: "tratamiento-de-frio.firebasestorage.app",
    messagingSenderId: "489852863950",
    appId: "1:489852863950:web:494a266878ad5e061dd79f"
  };

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { auth, db, storage };
