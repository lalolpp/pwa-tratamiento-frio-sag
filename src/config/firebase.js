const isDevMode = true;

let auth, db, storage;

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
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROJECT.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
  };

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { auth, db, storage };
