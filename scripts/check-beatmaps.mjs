/**
 * Refuses beatmaps a hand cannot play.
 *
 * This exists because a map shipped asking for a pinch every 214 ms, which is
 * not hard, it is impossible: PINCH_COOLDOWN_MS alone is 140 ms, and the
 * fingers still have to close, be seen to close by a ~30 fps webcam, reopen
 * past PINCH_OFF_RATIO, and carry the hand to the next target. Nothing caught
 * it, because nothing was looking -- a beatmap is data, and data compiles.
 *
 * MIN_GAP is empirical, not theoretical: the demo map is playtested and its
 * hardest phase bottoms out at 0.75 s. 0.6 s leaves room for a map that is
 * deliberately faster than anything validated, and refuses everything below.
 *
 * Run: node scripts/check-beatmaps.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Seconds between the end of one note and the head of the next. */
const MIN_GAP = 0.6;
/** Keep notes clear of the playfield edge, where tracking is worst. */
const MARGIN = 0.04;
/**
 * Seconds of a freeze per frozen note: no timing to meet, but the hand still
 * has to travel, pinch and open again for each.
 */
const FROZEN_PINCH = 0.7;
/**
 * Seconds at the start of a freeze before its notes appear (FREEZE_ENTRY in
 * src/config/settings.ts).
 */
const FREEZE_ENTRY = 0.8;

const MAPS = [
  ['demo', 'demoBeatmap'],
  ['constellation', 'constellationBeatmap'],
];

const out = mkdtempSync(join(tmpdir(), 'fingertune-maps-'));
const failures = [];

try {
  // The maps are TypeScript, so compile them somewhere throwaway and import
  // the real objects. Parsing the source instead would only ever check the
  // literals, and every one of these maps is built from helpers.
  /* The compiler is invoked as a JS file through the current node, not through
     `npx`: on Windows npx is a .cmd and spawning it without a shell fails with
     EINVAL, while spawning it *with* one drags in quoting rules that differ
     per platform. This path has neither problem. */
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
      ...MAPS.map(([name]) => `src/beatmaps/${name}.ts`),
      '--outDir',
      out,
      '--module',
      'esnext',
      '--target',
      'es2022',
      '--moduleResolution',
      'bundler',
      '--skipLibCheck',
    ],
    { stdio: 'pipe' },
  );
  writeFileSync(join(out, 'package.json'), '{"type":"module"}');

  for (const [file, exported] of MAPS) {
    const url = pathToFileURL(join(out, 'beatmaps', `${file}.js`)).href;
    const map = (await import(url))[exported];
    const fail = (message) => failures.push(`${map?.title ?? file}: ${message}`);

    if (!map) {
      fail(`does not export ${exported}`);
      continue;
    }

    const notes = [...map.notes].sort((a, b) => a.t - b.t);
    if (notes.some((note, i) => note !== map.notes[i])) {
      fail('notes are not sorted by time');
    }

    for (const note of notes) {
      const points = [{ x: note.x, y: note.y }, ...(note.path ?? [])];
      for (const point of points) {
        if (
          point.x < MARGIN ||
          point.x > 1 - MARGIN ||
          point.y < MARGIN ||
          point.y > 1 - MARGIN
        ) {
          fail(`a point at t=${note.t.toFixed(2)}s falls outside the playfield`);
          break;
        }
      }
    }

    /* Frozen notes are taken inside a freeze, in any order, with no timing:
       they are checked against their freeze rather than against each other.
       A freeze adds no time between the notes either side of it -- it can
       end the moment its last note is taken -- so the gap rule runs over the
       timed notes as if it were not there. */
    const timed = notes.filter((note) => !note.frozen);
    for (let i = 1; i < timed.length; i++) {
      const previous = timed[i - 1];
      const gap = timed[i].t - (previous.t + (previous.duration ?? 0));
      if (gap < MIN_GAP) {
        fail(
          `${gap.toFixed(2)}s between notes at t=${timed[i].t.toFixed(2)}s ` +
            `— below the ${MIN_GAP}s a pinch cycle needs`,
        );
      }
    }

    const freezes = map.freezes ?? [];
    for (const freeze of freezes) {
      const frozen = notes.filter((note) => note.frozen && Math.abs(note.t - freeze.t) < 1e-6);
      if (frozen.length * FROZEN_PINCH > freeze.seconds - FREEZE_ENTRY) {
        fail(
          `${frozen.length} frozen notes in the ${freeze.seconds}s freeze at t=${freeze.t.toFixed(2)}s ` +
            `— a hand needs ${FROZEN_PINCH}s for each, after ${FREEZE_ENTRY}s for it to settle`,
        );
      }
      const after = timed.find((note) => note.t > freeze.t);
      if (after && after.t - freeze.t < MIN_GAP) {
        fail(`the note at t=${after.t.toFixed(2)}s follows the freeze at t=${freeze.t.toFixed(2)}s too closely`);
      }
    }
    for (const note of notes.filter((n) => n.frozen)) {
      if (!freezes.some((freeze) => Math.abs(freeze.t - note.t) < 1e-6)) {
        fail(`the frozen note at t=${note.t.toFixed(2)}s belongs to no freeze`);
      }
    }

    const phases = map.phases;
    if (!phases?.length || phases[0].start !== 0) {
      fail('the first phase must start at 0');
    }
    for (let i = 1; i < (phases?.length ?? 0); i++) {
      if (phases[i].start <= phases[i - 1].start) {
        fail(`phase "${phases[i].id}" does not start after the one before it`);
      }
    }

    const last = notes.at(-1);
    const length = last ? last.t + (last.duration ?? 0) : 0;
    console.log(
      `  ${map.title.padEnd(22)} ${String(notes.length).padStart(3)} notes  ` +
        `${length.toFixed(0).padStart(3)}s  ${phases?.length ?? 0} phases`,
    );
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('\nUnplayable beatmaps:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nAll beatmaps playable.');
