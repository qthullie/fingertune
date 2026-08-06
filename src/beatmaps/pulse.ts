/**
 * Pulse (~90 s at 140 BPM) — circles only.
 *
 * No sliders anywhere, so nothing ever asks you to hold a pinch. That single
 * restriction is what the map is for: it is about timing and nothing else.
 *
 * THE SPACING IS THE WHOLE DESIGN, and the first version of this map got it
 * badly wrong. It used musical subdivisions -- eighths at 140 BPM, one note
 * every 214 ms -- which is unplayable and was never going to be anything else.
 * A pinch is not a keypress: the fingers have to close, be seen to close by a
 * webcam running at ~30 fps, reopen far enough to clear PINCH_OFF_RATIO, and
 * the hand has to travel to the next target in between. PINCH_COOLDOWN_MS
 * alone is 140 ms, so 214 ms spacing sits inside the cooldown's shadow.
 *
 * The only empirical number available is the demo map, which is playtested:
 * its hardest phase bottoms out at 0.75 s between notes. This map is meant to
 * be the fast one, so it goes below that -- but by 15%, not by 350%. The floor
 * here is 1.5 beats, 0.64 s, and it is only ever used in short bursts.
 *
 *   Warm-up  4 beats   1.71 s
 *   Drive    2 beats   0.86 s
 *   Sprint   1.5 beats 0.64 s, in bursts of four with a bar to recover
 *
 * Positions stay inside a band around the centre. At this pace the second
 * limit is how far a hand travels between two notes, and a target in a far
 * corner is not difficult, it is impossible -- which teaches players that
 * misses are the game's fault.
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
  step: number,
): BeatmapNote[] {
  return points.map(([x, y], i) => ({ x, y, t: at(startBeat + i * step) }));
}

/** Alternates left and right of the centre — the metronome made visible. */
function sway(
  startBeat: number,
  count: number,
  spread: number,
  y: number,
  step: number,
): BeatmapNote[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 0.5 + (i % 2 === 0 ? -spread : spread),
    y,
    t: at(startBeat + i * step),
  }));
}

/* -------------------------------------------------------------------------- */
/* Phase 1 — Warm-up: one note every 4 beats (1.71 s). Learn the pace.         */
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
  ...sway(16, 6, 0.14, 0.5, 4),
  ...run(
    40,
    [
      [0.5, 0.38],
      [0.5, 0.62],
      [0.36, 0.5],
      [0.64, 0.5],
    ],
    4,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 2 — Drive: every 2 beats (0.86 s). Still above the demo's hardest.    */
/* -------------------------------------------------------------------------- */
const drive: BeatmapNote[] = [
  ...sway(60, 8, 0.2, 0.5, 2),
  ...run(
    78,
    [
      [0.3, 0.4],
      [0.5, 0.55],
      [0.7, 0.4],
      [0.5, 0.55],
      [0.3, 0.4],
    ],
    2,
  ),
  ...sway(90, 8, 0.22, 0.55, 2),
  ...run(
    108,
    [
      [0.35, 0.62],
      [0.5, 0.38],
      [0.65, 0.62],
      [0.5, 0.38],
    ],
    2,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 3 — Sprint: bursts of four at 1.5 beats (0.64 s), a bar to recover.   */
/*                                                                            */
/* Bursts rather than a continuous stream, and the recovery is not padding:    */
/* a hand pinching without pause stops opening fully after a few seconds, and  */
/* every pinch after that reads as one long hold. The map would then be        */
/* punishing fatigue rather than timing.                                      */
/*                                                                            */
/* Inside a burst the targets barely move -- at 0.64 s the hand has no time to */
/* cross the playfield, so travel is saved for the gaps between bursts.        */
/* -------------------------------------------------------------------------- */
const sprint: BeatmapNote[] = [
  ...run(
    124,
    [
      [0.44, 0.46],
      [0.56, 0.46],
      [0.56, 0.58],
      [0.44, 0.58],
    ],
    1.5,
  ),
  ...run(
    134,
    [
      [0.32, 0.5],
      [0.44, 0.5],
      [0.56, 0.5],
      [0.68, 0.5],
    ],
    1.5,
  ),
  ...run(
    144,
    [
      [0.5, 0.36],
      [0.5, 0.5],
      [0.5, 0.64],
      [0.5, 0.5],
    ],
    1.5,
  ),
  ...sway(154, 4, 0.16, 0.52, 1.5),
  ...run(
    164,
    [
      [0.38, 0.42],
      [0.5, 0.54],
      [0.62, 0.42],
      [0.5, 0.54],
    ],
    1.5,
  ),
  // Last four, spread out again: a map should end on something you can land.
  ...run(
    174,
    [
      [0.3, 0.5],
      [0.5, 0.42],
      [0.7, 0.5],
      [0.5, 0.58],
    ],
    2,
  ),
];

const phases: BeatmapPhase[] = [
  {
    id: 'warmup',
    name: 'Warm-up',
    hint: 'One note every four beats. Find the rhythm.',
    start: 0,
    approachTime: 1.8,
    hitWindowScale: 2.4,
    targetScale: 1.3,
  },
  {
    id: 'drive',
    name: 'Drive',
    hint: 'Every two beats now, side to side.',
    start: at(60) - INTRO,
    approachTime: 1.4,
    hitWindowScale: 1.6,
    targetScale: 1.15,
  },
  {
    id: 'sprint',
    name: 'Sprint',
    hint: 'Bursts of four. Breathe between them.',
    start: at(124) - INTRO,
    approachTime: 1.05,
    hitWindowScale: 1.15,
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
