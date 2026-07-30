/**
 * Recopie le build single-file (dist-standalone/index.html) dans
 * standalone/fingertune.html, qui est versionne pour pouvoir etre ouvert
 * directement depuis le repo — meme jeu, meme code, un seul fichier.
 *
 * Lance par `npm run build:standalone`.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'dist-standalone', 'index.html');
const destDir = path.join(root, 'standalone');
const dest = path.join(destDir, 'fingertune.html');

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
const { size } = await stat(dest);
console.log(
  `[fingertune] single-file -> ${path.relative(root, dest)} (${(size / 1024).toFixed(0)} Ko)`,
);
