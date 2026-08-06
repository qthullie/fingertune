/**
 * Pulse (~55 s at 140 BPM) — circles only, and fast.
 *
 * The counterpart to the demo map: no sliders anywhere, so nothing ever asks
 * you to hold a pinch. That single restriction changes what the map is about.
 * A slider is a test of steadiness; a circle is a test of timing, and stripping
 * the map down to circles alone lets the notes come much closer together
 * without the hand ever having to travel while pinched.
 *
 * Positions stay inside a band around the centre. At this density the limit is
 * not the gesture, it is how far a hand can move between two beats — a note in
 * a far corner at 140 BPM is not hard, it is impossible, and a map that asks
 * for it teaches players that misses are the game's fault.
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 140;
const BEAT = 60 / BPM; // ~0.4286 s
const INTRO = 2;

const at = (beat: number): number => INTRO + beat * BEAT;

/** One note per position, `step` beats apart. */
function run(
  startBeat: number,
  points: ReadonlyArray<readonly [number, number]>,
  step = 1,
): BeatmapNote[] {
  return points.map(([x, y], i) => ({ x, y, t: at(startBeat + i * step) }));
}

/** Alternates left and right of the centre — the metronome made visible. */
function sway(startBeat: number, count: number, spread: number, y: number, step = 1): BeatmapNote[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 0.5 + (i % 2 === 0 ? -spread : spread),
    y,
    t: at(startBeat + i * step),
  }));
}

/* -------------------------------------------------------------------------- */
/* Phase 1 — Warm-up: one note every 2 beats, all near the middle.             */
/* -------------------------------------------------------------------------- */
const warmup: BeatmapNote[] = [
  ...run(
    0,
    [
      [0.5, 0.5],
      [0.4, 0.45],
      [0.6, 0.45],
      [0.5, 0.6],
    ],
    4,
  ),
  ...sway(18, 6, 0.14, 0.5, 2),
  ...run(
    32,
    [
      [0.5, 0.38],
      [0.5, 0.62],
      [0.36, 0.5],
      [0.64, 0.5],
    ],
    2,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 2 — Drive: every beat, wider sway.                                    */
/* -------------------------------------------------------------------------- */
const drive: BeatmapNote[] = [
  ...sway(44, 8, 0.2, 0.5),
  ...run(
    54,
    [
      [0.3, 0.4],
      [0.5, 0.55],
      [0.7, 0.4],
      [0.5, 0.55],
      [0.3, 0.4],
    ],
    1,
  ),
  ...sway(62, 8, 0.22, 0.55),
  ...run(
    72,
    [
      [0.35, 0.62],
      [0.5, 0.38],
      [0.65, 0.62],
      [0.5, 0.38],
    ],
    1,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 3 — Sprint: eighths in short bursts, with a beat to recover between.  */
/*                                                                            */
/* The bursts are the point. Continuous eighths for thirty seconds is not      */
/* harder, only more tiring: the hand stops being able to open fully and every */
/* pinch after that reads as one long hold.                                    */
/* -------------------------------------------------------------------------- */
const sprint: BeatmapNote[] = [
  ...sway(84, 4, 0.16, 0.5, 0.5),
  ...run(
    88,
    [
      [0.42, 0.44],
      [0.58, 0.44],
      [0.58, 0.6],
      [0.42, 0.6],
    ],
    0.5,
  ),
  ...sway(94, 4, 0.18, 0.52, 0.5),
  ...run(
    98,
    [
      [0.5, 0.36],
      [0.36, 0.52],
      [0.5, 0.66],
      [0.64, 0.52],
    ],
    0.5,
  ),
  ...sway(104, 6, 0.2, 0.5, 0.5),
  ...run(
    110,
    [
      [0.3, 0.5],
      [0.5, 0.5],
      [0.7, 0.5],
    ],
    1,
  ),
  ...run(
    116,
    [
      [0.5, 0.42],
      [0.5, 0.58],
      [0.5, 0.5],
    ],
    1,
  ),
];

const phases: BeatmapPhase[] = [
  {
    id: 'warmup',
    name: 'Warm-up',
    hint: 'Every other beat. Find the rhythm.',
    start: 0,
    approachTime: 1.8,
    hitWindowScale: 2,
    targetScale: 1.25,
  },
  {
    id: 'drive',
    name: 'Drive',
    hint: 'One note per beat, side to side.',
    start: at(44) - INTRO,
    approachTime: 1.3,
    hitWindowScale: 1.4,
    targetScale: 1.1,
  },
  {
    id: 'sprint',
    name: 'Sprint',
    hint: 'Eighths, in bursts. Breathe between them.',
    start: at(84) - INTRO,
    approachTime: 0.95,
    hitWindowScale: 1,
    targetScale: 1,
  },
];

export const pulseBeatmap: Beatmap = {
  id: 'pulse',
  title: 'Pulse',
  author: 'qthullie',
  bpm: BPM,
  phases,
  notes: [...warmup, ...drive, ...sprint].sort((a, b) => a.t - b.t),
};
