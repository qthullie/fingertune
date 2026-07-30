/**
 * Prepare public/ avant dev et build :
 *   1. binaires WASM de @mediapipe/tasks-vision -> public/mediapipe/wasm
 *      (servis depuis notre propre origine : pas de dependance CDN a l'execution)
 *   2. assets/logo.svg -> public/favicon.svg
 *      (source unique pour le README, l'accueil et l'onglet du navigateur)
 *
 * Lance automatiquement par les hooks npm `predev` et `prebuild`.
 */
import { cp, mkdir, access, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 1. wasm MediaPipe */
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = path.join(root, 'public', 'mediapipe', 'wasm');

try {
  await access(wasmSrc);
  await mkdir(path.dirname(wasmDest), { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log(`[fingertune] wasm MediaPipe copie -> ${path.relative(root, wasmDest)}`);
} catch {
  console.warn(
    '[fingertune] @mediapipe/tasks-vision introuvable dans node_modules — ' +
      'lance `npm install` d\'abord. Le jeu retombera sur le CDN.',
  );
}

/* 2. favicon */
const logoSrc = path.join(root, 'assets', 'logo.svg');
const faviconDest = path.join(root, 'public', 'favicon.svg');

await mkdir(path.dirname(faviconDest), { recursive: true });
await copyFile(logoSrc, faviconDest);
console.log(`[fingertune] logo copie -> ${path.relative(root, faviconDest)}`);
