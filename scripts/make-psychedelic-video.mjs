/**
 * Renders src/assets/psychedelic.mp4, the looping backdrop of Chromatic's phases.
 *
 * An endless rainbow tunnel with a swirl through it, computed per pixel by
 * ffmpeg's geq filter. Every time term completes a whole number of turns over
 * the clip, so the last frame runs straight into the first. Needs ffmpeg on PATH.
 *
 *   node scripts/make-psychedelic-video.mjs
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const SECONDS = 8;
const OUT = 'src/assets/psychedelic.mp4';

// Radius (log scale: perspective rings) and angle around the centre, then the
// rings rushing outward with a twisting swirl on top.
const field = [
  'st(0,hypot(X-W/2,Y-H/2)/H+0.02)',
  'st(1,atan2(Y-H/2,X-W/2))',
  `st(2,7*log(ld(0))-4*PI*T/${SECONDS}+3*ld(1)+1.6*sin(6*ld(1)+5*log(ld(0))-2*PI*T/${SECONDS}))`,
].join(';');

// Three phase-shifted sines: a full rainbow, and never black.
const channel = (offset) => `'${field};128+127*sin(ld(2)+${offset})'`;

mkdirSync('src/assets', { recursive: true });
const { status } = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=640x360:r=30:d=${SECONDS}`,
    '-vf', `format=gbrp,geq=r=${channel(0)}:g=${channel(2.094)}:b=${channel(4.189)},format=yuv420p`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '30',
    '-movflags', '+faststart',
    '-an',
    OUT,
  ],
  { stdio: 'inherit' },
);
process.exit(status ?? 1);
