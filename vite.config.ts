import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** A plain static site in dist/: GitHub Pages, Netlify, or any folder. */
export default defineConfig({
  plugins: [react()],
  // Relative base: the build works as-is on GitHub Pages (project sites are
  // served from /<repo>/), on Netlify/Vercel, or as a plain static folder.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // The MediaPipe wasm binaries are copied into public/mediapipe/wasm by
  // scripts/copy-assets.mjs (predev / prebuild hooks).
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
});
