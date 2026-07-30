import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Base relative : le build fonctionne tel quel sur GitHub Pages (site de projet
  // servi depuis /<repo>/), sur Netlify/Vercel, ou en simple dossier statique.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // Les binaires wasm de MediaPipe sont copies dans public/mediapipe/wasm par
  // scripts/copy-mediapipe-assets.mjs (hook predev / prebuild).
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
});
