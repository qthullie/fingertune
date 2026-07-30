/**
 * Copie les binaires WASM de @mediapipe/tasks-vision dans public/mediapipe/wasm.
 *
 * Pourquoi : le runtime MediaPipe charge son wasm a l'execution via une URL.
 * En les servant depuis notre propre origine, le jeu fonctionne hors ligne et
 * ne depend d'aucun CDN tiers.
 *
 * Lance automatiquement par les hooks npm `predev` et `prebuild`.
 */
import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = path.join(root, 'public', 'mediapipe', 'wasm');

try {
  await access(src);
} catch {
  console.warn(
    '[fingertune] @mediapipe/tasks-vision introuvable dans node_modules — ' +
      'lance `npm install` d\'abord. Le jeu retombera sur le CDN.',
  );
  process.exit(0);
}

await mkdir(path.dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[fingertune] wasm MediaPipe copie -> ${path.relative(root, dest)}`);
