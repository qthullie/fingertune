/**
 * Telecharge le modele hand_landmarker.task (~7 Mo) dans public/models/.
 *
 * Optionnel : par defaut le jeu charge le modele depuis storage.googleapis.com.
 * Lance `npm run fetch:model` puis mets VITE_HAND_MODEL_URL=./models/hand_landmarker.task
 * dans .env.local pour un fonctionnement 100 % hors ligne / self-hosted.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'models');
const outFile = path.join(outDir, 'hand_landmarker.task');

console.log(`[fingertune] telechargement ${URL_MODEL}`);
const res = await fetch(URL_MODEL);
if (!res.ok) {
  console.error(`[fingertune] echec HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
console.log(`[fingertune] modele ecrit -> ${path.relative(root, outFile)}`);
console.log('[fingertune] ajoute a .env.local :');
console.log('  VITE_HAND_MODEL_URL=./models/hand_landmarker.task');
