import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two build modes:
 *   - default      : a plain static site in dist/ (GitHub Pages, Netlify…)
 *   - "standalone" : one self-contained HTML file in dist-standalone/, with the
 *                    MediaPipe wasm pulled from a CDN (see .env.standalone).
 *                    `npm run build:standalone` copies it into standalone/.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'standalone' ? [viteSingleFile()] : [])],
  // Relative base: the build works as-is on GitHub Pages (project sites are
  // served from /<repo>/), on Netlify/Vercel, or as a plain static folder.
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
  // The MediaPipe wasm binaries are copied into public/mediapipe/wasm by
  // scripts/copy-assets.mjs (predev / prebuild hooks).
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
}));
