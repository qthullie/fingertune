import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Deux modes de build :
 *   - defaut       : site statique classique dans dist/ (GitHub Pages, Netlify…)
 *   - "standalone" : un seul fichier HTML auto-porteur dans dist-standalone/,
 *                    avec le wasm MediaPipe pris sur CDN (voir .env.standalone).
 *                    `npm run build:standalone` le recopie dans standalone/.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'standalone' ? [viteSingleFile()] : [])],
  // Base relative : le build fonctionne tel quel sur GitHub Pages (site de projet
  // servi depuis /<repo>/), sur Netlify/Vercel, ou en simple dossier statique.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: mode !== 'standalone',
    outDir: mode === 'standalone' ? 'dist-standalone' : 'dist',
  },
  // Les binaires wasm de MediaPipe sont copies dans public/mediapipe/wasm par
  // scripts/copy-mediapipe-assets.mjs (hook predev / prebuild).
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
}));
