/**
 * Drift (~85 s at 100 BPM) — sliders, with circles to move between them.
 *
 * The opposite restriction to Pulse. Where that map removes the hold entirely,
 * this one leans on it: long paths, slow tempo, and circles used to carry the
 * hand into position for the next head.
 *
 * A held pinch is a different problem from a timed one. The ratio has to stay
 * under PINCH_OFF_RATIO for seconds at a time while the whole hand translates
 * across the frame -- and a hand in motion is exactly when the One-Euro filter
 * is least certain. So: slow tempo, and paths sampled into many points rather
 * than left as a few. The ball travels at constant speed along the polyline,
 * so a coarse arc lurches at every vertex and the follow test then fails
 * people who were tracking it perfectly.
 *
 * TWO THINGS THE FIRST VERSION GOT WRONG.
 *
 * It was far too sparse -- nineteen notes across eighty seconds, six per
 * phase. Beyond feeling empty, six notes means one dropped slider takes a
 * sixth of the accuracy with it, and a map where a single mistake is visibly
 * catastrophic reads as broken rather than hard. There are now roughly twice
 * as many, with circles filling what used to be dead air.
 *
 * And the arcs swept too far. A semicircle of radius 0.22 puts the ball near
 * the top edge of the playfield, where a hand is at the limit of the camera's
 * view and tracking is worst -- the map was asking for steadiness exactly
 * where the pipeline cannot deliver it. The arcs are shallower now and stay in
 * the middle band.
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 100;
const BEAT = 60 / BPM; // 0.6 s
const INTRO = 2;

const at = (beat: number): number => INTRO + beat * BEAT;

function run(
  startBeat: number,
  points: ReadonlyArray<readonly [number, number]>,
  step: number,
): BeatmapNote[] {
  return points.map(([x, y], i) => ({ x, y, t: at(startBeat + i * step) }));
}

/** Head first, then the path the ball travels. `beats` is the travel time. */
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

/**
 * A shallow arc, sampled into a polyline.
 *
 * `flatten` squashes it vertically: the playfield is wider than it is tall, and
 * a true circle would push the ball into the top and bottom margins where the
 * hand leaves the camera's comfortable range.
 */
function arc(
  startBeat: number,
  cx: number,
  cy: number,
  radius: number,
  fromAngle: number,
  toAngle: number,
  beats: number,
  flatten = 0.55,
  steps = 12,
): BeatmapNote[] {
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const a = fromAngle + ((toAngle - fromAngle) * i) / steps;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius * flatten] as const;
  });
  return slider(startBeat, points, beats);
}

/* -------------------------------------------------------------------------- */
/* Phase 1 — Glide: short straight sliders, circles between them.              */
/* -------------------------------------------------------------------------- */
const glide: BeatmapNote[] = [
  ...run(
    0,
    [
      [0.5, 0.5],
      [0.4, 0.5],
    ],
    3,
  ),
  ...slider(
    8,
    [
      [0.34, 0.5],
      [0.66, 0.5],
    ],
    4,
  ),
  ...run(
    16,
    [
      [0.6, 0.6],
      [0.44, 0.6],
      [0.5, 0.44],
    ],
    3,
  ),
  ...slider(
    28,
    [
      [0.66, 0.44],
      [0.34, 0.44],
    ],
    4,
  ),
  ...run(
    36,
    [
      [0.4, 0.58],
      [0.6, 0.58],
    ],
    3,
  ),
  ...slider(
    44,
    [
      [0.36, 0.58],
      [0.5, 0.44],
      [0.64, 0.58],
    ],
    5,
  ),
  ...run(53, [[0.5, 0.5]], 3),
];

/* -------------------------------------------------------------------------- */
/* Phase 2 — Curve: shallow arcs, circles setting up each head.                */
/* -------------------------------------------------------------------------- */
const curve: BeatmapNote[] = [
  ...arc(60, 0.5, 0.5, 0.18, Math.PI, Math.PI * 2, 5),
  ...run(
    68,
    [
      [0.6, 0.6],
      [0.42, 0.6],
    ],
    2.5,
  ),
  ...arc(75, 0.5, 0.5, 0.19, 0, Math.PI, 5),
  ...run(
    83,
    [
      [0.36, 0.44],
      [0.5, 0.56],
    ],
    2.5,
  ),
  ...slider(
    90,
    [
      [0.32, 0.42],
      [0.5, 0.56],
      [0.68, 0.42],
    ],
    5,
  ),
  ...run(
    99,
    [
      [0.58, 0.58],
      [0.42, 0.58],
    ],
    2.5,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 3 — Weave: longer paths, tighter windows, less recovery.              */
/* -------------------------------------------------------------------------- */
const weave: BeatmapNote[] = [
  ...slider(
    108,
    [
      [0.3, 0.5],
      [0.43, 0.4],
      [0.57, 0.5],
      [0.7, 0.4],
    ],
    6,
  ),
  ...run(
    117,
    [
      [0.6, 0.6],
      [0.4, 0.6],
      [0.5, 0.46],
    ],
    2,
  ),
  ...arc(125, 0.5, 0.5, 0.2, Math.PI * 0.5, Math.PI * 1.5, 5),
  ...run(
    133,
    [
      [0.38, 0.56],
      [0.62, 0.56],
    ],
    2,
  ),
  ...slider(
    139,
    [
      [0.34, 0.46],
      [0.5, 0.58],
      [0.66, 0.46],
    ],
    5,
  ),
  ...run(
    148,
    [
      [0.5, 0.5],
      [0.4, 0.44],
      [0.6, 0.44],
    ],
    2,
  ),
];

const phases: BeatmapPhase[] = [
  {
    id: 'glide',
    name: 'Glide',
    hint: 'Pinch the head, hold, follow the ball.',
    start: 0,
    approachTime: 2.2,
    hitWindowScale: 2.5,
    targetScale: 1.3,
  },
  {
    id: 'curve',
    name: 'Curve',
    hint: 'The path bends now. Stay on the ball, not ahead of it.',
    start: at(60) - INTRO,
    approachTime: 1.7,
    hitWindowScale: 1.6,
    targetScale: 1.15,
  },
  {
    id: 'weave',
    name: 'Weave',
    hint: 'Longer holds, less recovery.',
    start: at(108) - INTRO,
    approachTime: 1.3,
    hitWindowScale: 1.2,
    targetScale: 1,
  },
];

export const driftBeatmap: Beatmap = {
  id: 'drift',
  title: 'Drift',
  author: 'qthullie',
  bpm: BPM,
  phases,
  notes: [...glide, ...curve, ...weave].sort((a, b) => a.t - b.t),
};
