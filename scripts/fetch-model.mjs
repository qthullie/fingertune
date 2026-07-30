/**
 * Downloads hand_landmarker.task (~7 MB) into public/models/.
 *
 * Optional: by default the game loads the model from storage.googleapis.com.
 * Run `npm run fetch:model`, then put
 *   VITE_HAND_MODEL_URL=./models/hand_landmarker.task
 * in .env.local for a fully offline, self-hosted setup.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'models');
const outFile = path.join(outDir, 'hand_landmarker.task');

console.log(`[fingertune] downloading ${MODEL_URL}`);
const res = await fetch(MODEL_URL);
if (!res.ok) {
  console.error(`[fingertune] HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
console.log(`[fingertune] model written -> ${path.relative(root, outFile)}`);
console.log('[fingertune] add this to .env.local:');
console.log('  VITE_HAND_MODEL_URL=./models/hand_landmarker.task');
