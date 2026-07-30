/**
 * Copies the single-file build (dist-standalone/index.html) to
 * standalone/fingertune.html, which is committed so it can be opened straight
 * from the repository — same game, same code, one file.
 *
 * Run by `npm run build:standalone`.
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
  `[fingertune] single-file -> ${path.relative(root, dest)} (${(size / 1024).toFixed(0)} kB)`,
);
