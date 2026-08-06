/**
 * Drift (~80 s at 100 BPM) — sliders, mostly.
 *
 * The opposite restriction to Pulse. Where that map removes the hold entirely,
 * this one leans on it: long paths, slow tempo, and circles used only to move
 * the hand into position for the next head.
 *
 * A held pinch is a different problem from a timed one. The pinch ratio has to
 * stay under the release threshold for seconds at a time while the whole hand
 * translates across the frame -- and a hand in motion is exactly when the
 * One-Euro filter is least certain. So the tempo is slow and the paths are
 * smooth: a slider with a sharp corner is not a test of steadiness, it is a
 * test of whether you guessed where the ball would go.
 *
 * Every slider ends with at least two beats of silence. Releasing a pinch,
 * bringing the hand back and re-pinching takes far longer than tapping two
 * circles in a row, and a map that forgets that plays as if it were broken.
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 100;
const BEAT = 60 / BPM; // 0.6 s
const INTRO = 2;

const at = (beat: number): number => INTRO + beat * BEAT;

function run(
  startBeat: number,
  points: ReadonlyArray<readonly [number, number]>,
  step = 1,
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
 * A slider along an arc, sampled into a polyline.
 *
 * Sampled rather than left as three points: the ball moves at constant speed
 * along the polyline, so a coarse arc makes it lurch at every vertex, and the
 * follow test then fails for people who were tracking it perfectly well.
 */
function arc(
  startBeat: number,
  cx: number,
  cy: number,
  radius: number,
  fromAngle: number,
  toAngle: number,
  beats: number,
  steps = 10,
): BeatmapNote[] {
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const a = fromAngle + ((toAngle - fromAngle) * i) / steps;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius * 1.2] as const;
  });
  return slider(startBeat, points, beats);
}

/* -------------------------------------------------------------------------- */
/* Phase 1 — Glide: straight, slow sliders, generous everything.               */
/* -------------------------------------------------------------------------- */
const glide: BeatmapNote[] = [
  ...run(0, [[0.5, 0.5]], 1),
  ...slider(
    4,
    [
      [0.32, 0.5],
      [0.68, 0.5],
    ],
    6,
  ),
  ...run(
    14,
    [
      [0.5, 0.62],
      [0.5, 0.4],
    ],
    3,
  ),
  ...slider(
    22,
    [
      [0.68, 0.42],
      [0.32, 0.42],
    ],
    6,
  ),
  ...slider(
    32,
    [
      [0.35, 0.6],
      [0.5, 0.4],
      [0.65, 0.6],
    ],
    6,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 2 — Curve: arcs, and circles that set up the next head.               */
/* -------------------------------------------------------------------------- */
const curve: BeatmapNote[] = [
  ...arc(44, 0.5, 0.5, 0.2, Math.PI, Math.PI * 2, 6),
  ...run(
    54,
    [
      [0.6, 0.62],
      [0.4, 0.62],
    ],
    2,
  ),
  ...arc(60, 0.5, 0.48, 0.22, Math.PI * 1.5, Math.PI * 0.5, 6),
  ...slider(
    70,
    [
      [0.3, 0.38],
      [0.5, 0.58],
      [0.7, 0.38],
      [0.5, 0.3],
    ],
    8,
  ),
  ...run(82, [[0.5, 0.55]], 1),
];

/* -------------------------------------------------------------------------- */
/* Phase 3 — Weave: longer paths, tighter windows, less recovery.              */
/* -------------------------------------------------------------------------- */
const weave: BeatmapNote[] = [
  ...slider(
    88,
    [
      [0.28, 0.5],
      [0.42, 0.34],
      [0.58, 0.5],
      [0.72, 0.34],
    ],
    8,
  ),
  ...run(
    99,
    [
      [0.6, 0.62],
      [0.38, 0.62],
    ],
    2,
  ),
  ...arc(104, 0.5, 0.5, 0.24, Math.PI * 0.5, Math.PI * 1.5, 7),
  ...slider(
    115,
    [
      [0.32, 0.44],
      [0.5, 0.6],
      [0.68, 0.44],
    ],
    7,
  ),
  ...run(
    126,
    [
      [0.5, 0.5],
      [0.5, 0.5],
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
    start: at(44) - INTRO,
    approachTime: 1.6,
    hitWindowScale: 1.5,
    targetScale: 1.1,
  },
  {
    id: 'weave',
    name: 'Weave',
    hint: 'Long holds, little recovery.',
    start: at(88) - INTRO,
    approachTime: 1.2,
    hitWindowScale: 1.1,
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
