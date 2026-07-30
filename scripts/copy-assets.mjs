/**
 * Prepares public/ before dev and build:
 *   1. WASM binaries of @mediapipe/tasks-vision -> public/mediapipe/wasm
 *      (served from our own origin: no CDN dependency at runtime)
 *   2. assets/logo.svg -> public/favicon.svg
 *      (single source for the README, the start screen and the browser tab)
 *
 * Run automatically by the npm `predev` and `prebuild` hooks.
 */
import { cp, mkdir, access, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 1. MediaPipe wasm */
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = path.join(root, 'public', 'mediapipe', 'wasm');

try {
  await access(wasmSrc);
  await mkdir(path.dirname(wasmDest), { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log(`[fingertune] MediaPipe wasm copied -> ${path.relative(root, wasmDest)}`);
} catch {
  console.warn(
    '[fingertune] @mediapipe/tasks-vision not found in node_modules — run `npm install` ' +
      'first. The game will fall back to the CDN.',
  );
}

/* 2. favicon */
const logoSrc = path.join(root, 'assets', 'logo.svg');
const faviconDest = path.join(root, 'public', 'favicon.svg');

await mkdir(path.dirname(faviconDest), { recursive: true });
await copyFile(logoSrc, faviconDest);
console.log(`[fingertune] logo copied -> ${path.relative(root, faviconDest)}`);
