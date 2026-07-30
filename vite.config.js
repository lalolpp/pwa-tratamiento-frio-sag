import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  root: '.',
  publicDir: 'public',
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      ...(mode !== 'production' ? {
        'firebase/app': resolve(__dirname, 'src/config/mockAuth.js'),
        'firebase/auth': resolve(__dirname, 'src/config/mockAuth.js'),
        'firebase/firestore': resolve(__dirname, 'src/config/mockFirestore.js'),
      } : {}),
    },
  },
  server: {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  },
}));
