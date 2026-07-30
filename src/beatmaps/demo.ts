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

/**
 * A slider: pinch the head, hold, and follow the ball along the polyline.
 *
 * @param startBeat when the head must be hit
 * @param points    head first, then the rest of the path
 * @param beats     travel time, in beats
 */
function slider(
  startBeat: number,
  points: ReadonlyArray<readonly [number, number]>,
  beats: number,
): BeatmapNote[] {
  const [head, ...rest] = points;
  if (!head) return [];
  return [
    {
      x: head[0],
      y: head[1],
      t: at(startBeat),
      kind: 'slider',
      path: rest.map(([x, y]) => ({ x, y })),
      duration: beats * BEAT,
    },
  ];
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
const easy: BeatmapNote[] = [
  ...path(
    0,
    [
      [0.5, 0.5],
      [0.38, 0.5],
      [0.62, 0.5],
      [0.38, 0.38],
      [0.62, 0.38],
    ],
    6,
  ),

  // First slider: slow, straight, left to right. Four beats to cross it.
  ...slider(
    30,
    [
      [0.3, 0.5],
      [0.7, 0.5],
    ],
    4,
  ),

  // Four beats of breathing room after the slider tail: releasing the pinch,
  // bringing the hand back and re-pinching takes noticeably longer than
  // tapping two circles in a row.
  ...path(
    38,
    [
      [0.35, 0.62],
      [0.65, 0.62],
      [0.5, 0.35],
    ],
    6,
  ),

  // Second slider: an L, so the direction has to be read, not guessed.
  ...slider(
    56,
    [
      [0.68, 0.35],
      [0.68, 0.62],
      [0.35, 0.62],
    ],
    5,
  ),

  // Tail at beat 61, next note at 65, and the phase ends before Medium at 72.
  ...path(
    65,
    [
      [0.3, 0.48],
      [0.7, 0.48],
    ],
    3,
  ),
];

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
  // Diagonal slider, then a zigzag one: the ball changes direction twice.
  ...slider(
    92,
    [
      [0.28, 0.68],
      [0.62, 0.34],
    ],
    3,
  ),
  ...slider(
    99,
    [
      [0.7, 0.34],
      [0.55, 0.6],
      [0.38, 0.34],
      [0.25, 0.58],
    ],
    4,
  ),

  // Tail at 103; the ring starts 4 beats later.
  ...ring(107, 8, 0.5, 0.5, 0.22, 2.5, -Math.PI / 2),

  // Four notes to close the phase; it must end before beat 136, where Hard starts.
  ...path(
    127,
    [
      [0.28, 0.68],
      [0.72, 0.68],
      [0.38, 0.3],
      [0.62, 0.3],
    ],
    2,
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

  // Fast slider: same shapes as Easy, half the time to travel them.
  ...slider(
    146,
    [
      [0.32, 0.4],
      [0.66, 0.4],
      [0.66, 0.62],
    ],
    2.5,
  ),

  // Tail at 148.5. Even at Hard the recovery gets 3 beats.
  ...ring(153, 8, 0.5, 0.5, 0.18, 1.5, -Math.PI / 2),

  // Staircase up, then down.
  ...path(
    166,
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
    178,
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

  // Closing slider: a long S to hold all the way through.
  ...slider(
    192,
    [
      [0.28, 0.42],
      [0.45, 0.62],
      [0.62, 0.38],
      [0.75, 0.55],
    ],
    5,
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
