import { initRouter } from './utils/router.js';
import { initOffline } from './services/offlineService.js';

import './styles/main.css';

initOffline();

initRouter(document.getElementById('app'));

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
