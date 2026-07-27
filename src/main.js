import { auth } from './config/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { initRouter } from './utils/router.js';

import './styles/main.css';

onAuthStateChanged(auth, (user) => {
  const app = document.getElementById('app');
  if (user) {
    initRouter(app);
  } else {
    import('./views/login.js').then((mod) => {
      mod.renderLogin(app);
    });
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (location.hostname === 'localhost') {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) { await reg.unregister(); }
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
