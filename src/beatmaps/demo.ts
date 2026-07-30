/**
 * Demo beatmap (~100 s at 120 BPM), in THREE difficulty phases.
 *
 *   1. Easy   — very slow: one note every 3 s, 2.6 s approach ring, big targets
 *               and triple-width timing windows. This is where you learn the
 *               gesture, not the timing.
 *   2. Medium — one note every 1.25 s, 1.6 s ring, wider movement.
 *   3. Hard   — 1.0 s ring, notes up to every 0.75 s, base timing windows.
 *
 * Designed for ONE hand: every note is reachable in sequence, none overlap.
 *
 * Note format: { x, y, t }
 *   x, y : normalised 0..1 inside the playfield (already mirrored, so x = 0 is
 *          on your left as you look at the screen).
 *   t    : hit instant, in seconds from the start of the track.
 *
 * The map is built with small helpers to stay readable, but you can replace it
 * with a plain literal:
 *   notes: [ { x: 0.3, y: 0.4, t: 2 }, { x: 0.7, y: 0.4, t: 2.5 } ]
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 120;
const BEAT = 60 / BPM; // 0.5 s
const INTRO = 2; // seconds of silence before the first note

/** Converts a beat number to seconds. */
const at = (beat: number): number => INTRO + beat * BEAT;

/** One note per step, along a list of positions. */
function path(
  startBeat: number,
  points: ReadonlyArray<readonly [number, number]>,
  step = 1,
): BeatmapNote[] {
  return points.map(([x, y], i) => ({ x, y, t: at(startBeat + i * step) }));
}

/** `count` notes around a circle (flattened vertically to fit the playfield). */
function ring(
  startBeat: number,
  count: number,
  cx: number,
  cy: number,
  radius: number,
  step = 1,
  phase = 0,
): BeatmapNote[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = phase + (i / count) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 1.25,
      t: at(startBeat + i * step),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Phase 1 — Easy: one note every 6 beats (3 s), near the centre.              */
/* -------------------------------------------------------------------------- */
const easy: BeatmapNote[] = path(
  0,
  [
    [0.5, 0.5],
    [0.38, 0.5],
    [0.62, 0.5],
    [0.38, 0.38],
    [0.62, 0.38],
    [0.35, 0.62],
    [0.65, 0.62],
    [0.5, 0.35],
    [0.3, 0.48],
    [0.7, 0.48],
    [0.5, 0.65],
    [0.5, 0.42],
  ],
  6,
);

/* -------------------------------------------------------------------------- */
/* Phase 2 — Medium: one note every 2.5 beats (1.25 s), wider reach.           */
/* -------------------------------------------------------------------------- */
const medium: BeatmapNote[] = [
  ...path(
    72,
    [
      [0.28, 0.4],
      [0.72, 0.4],
      [0.28, 0.62],
      [0.72, 0.62],
      [0.35, 0.3],
      [0.65, 0.3],
      [0.5, 0.5],
      [0.25, 0.55],
    ],
    2.5,
  ),
  ...ring(92, 8, 0.5, 0.5, 0.22, 2.5, -Math.PI / 2),
  ...path(
    112,
    [
      [0.28, 0.68],
      [0.72, 0.68],
      [0.38, 0.3],
      [0.62, 0.3],
      [0.25, 0.45],
      [0.75, 0.45],
      [0.5, 0.6],
      [0.5, 0.35],
    ],
    2.5,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 3 — Hard: fast single-hand runs, short travel between notes.          */
/* -------------------------------------------------------------------------- */
const hard: BeatmapNote[] = [
  // Short back-and-forth: the hand stays in one area.
  ...path(
    136,
    [
      [0.42, 0.45],
      [0.58, 0.45],
      [0.42, 0.6],
      [0.58, 0.6],
      [0.45, 0.35],
      [0.6, 0.35],
    ],
    1.5,
  ),

  // Tight ring, one note every 1.5 beats.
  ...ring(148, 8, 0.5, 0.5, 0.18, 1.5, -Math.PI / 2),

  // Staircase up, then down.
  ...path(
    162,
    [
      [0.3, 0.68],
      [0.4, 0.58],
      [0.5, 0.48],
      [0.6, 0.38],
      [0.7, 0.3],
      [0.6, 0.42],
      [0.5, 0.54],
      [0.4, 0.66],
    ],
    1.5,
  ),

  // Final burst, every 1.5 beats, small hops.
  ...path(
    176,
    [
      [0.35, 0.45],
      [0.5, 0.38],
      [0.65, 0.45],
      [0.5, 0.55],
      [0.35, 0.6],
      [0.5, 0.68],
      [0.65, 0.6],
      [0.5, 0.5],
    ],
    1.5,
  ),
];

/**
 * The phases. `start` is in beatmap seconds (before the countdown): each is set
 * slightly ahead of its first note so the banner has time to show.
 */
const phases: BeatmapPhase[] = [
  {
    id: 'easy',
    name: 'Phase 1 — Easy',
    hint: 'Very slow, big targets, very forgiving timing. Pinch as the ring closes.',
    start: 0,
    approachTime: 2.6,
    // 3x more forgiving (Perfect 180 ms, Good 360 ms) with 40% larger targets.
    hitWindowScale: 3,
    targetScale: 1.4,
  },
  {
    id: 'medium',
    name: 'Phase 2 — Medium',
    hint: 'Faster, and the targets spread out. Keep your hand up.',
    start: at(72) - 2.5,
    approachTime: 1.6,
    hitWindowScale: 1.8,
    targetScale: 1.15,
  },
  {
    id: 'hard',
    name: 'Phase 3 — Hard',
    hint: 'Short ring, tight windows, no room to drift.',
    start: at(136) - 2.5,
    approachTime: 1.0,
    hitWindowScale: 1,
    targetScale: 1,
  },
];

export const demoBeatmap: Beatmap = {
  id: 'demo',
  title: 'Demo — Three phases',
  author: 'Fingertune',
  bpm: BPM,
  phases,
  // Always sorted by time: the engine assumes ascending order.
  notes: [...easy, ...medium, ...hard].sort((a, b) => a.t - b.t),
};
