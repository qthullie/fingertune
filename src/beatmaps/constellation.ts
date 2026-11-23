/**
 * Constellation (~77 s at 100 BPM): every note you hit becomes a star, and
 * stars are linked in the order you hit them into figures, each in its own
 * part of the sky. A miss breaks the line, and the last phase lights up every
 * figure of the run at once -- then ties them together.
 *
 * Built like the last level of a rhythm game rather than like a drill: it has
 * a song with a shape (see `constellation` in lib/soundtracks.ts), and the
 * chart follows that shape instead of a difficulty curve.
 *
 *   1. Dusk       3 beats  1.8 s   The Dipper, top left: six stars and a
 *                                  slider that closes its bowl.
 *   2. Rise       2 beats  1.2 s   The build-up. Stars rush past faster and
 *                                  faster while a spiral winds in on the
 *                                  right, then two beats of silence.
 *   3. Supernova  2 / 1.5  1.2 s   The drop. A star in the middle with a halo
 *                                  over it, a small star, a comet, a ring,
 *                                  and the core.
 *   4. Afterglow  4 beats  2.4 s   A crescent moon to drag, then one star on
 *                                  each figure, linked across the whole sky.
 *
 * THE PACE IS SET BY THE HAND, NOT BY THE SONG. A pinch has to close, be seen
 * closing by a ~30 fps webcam, reopen past PINCH_OFF_RATIO, and travel (see
 * scripts/check-beatmaps.mjs for what happens when a chart forgets). So the drop is
 * made intense by everything around the notes -- sky, rays, music -- and the
 * notes themselves never come faster than 0.9 s, and only that fast on hops a
 * third the width of a pentagram. Between a slider's tail and the next head
 * there are always at least two beats.
 *
 * Every phase starts on a beat, and four beats after the music does (INTRO),
 * so that starting a run at a later phase keeps the notes on the grid of the
 * track, and the music switches section on the very beat a phase begins.
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 100;
const BEAT = 60 / BPM; // 0.6 s
const INTRO = 4 * BEAT;

const at = (beat: number): number => INTRO + beat * BEAT;

type Point = readonly [number, number];

/**
 * Width over height of a typical playfield. Shapes are laid out in playfield
 * units, which are stretched by this much horizontally; dividing it back out
 * of the vertical keeps a pentagram a pentagram rather than an ellipse.
 */
const ASPECT = 1.6;

/** A point `radius` (in horizontal units) from a centre, at `angle` radians. */
function polar(cx: number, cy: number, radius: number, angle: number): Point {
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * ASPECT];
}

function circle(beat: number, [x, y]: Point): BeatmapNote {
  return { x, y, t: at(beat) };
}

/** One circle per point, `step` beats apart. */
function chain(startBeat: number, points: ReadonlyArray<Point>, step: number): BeatmapNote[] {
  return points.map((point, i) => circle(startBeat + i * step, point));
}

/** Pinch the head, hold, and follow the ball to the last point. */
function slider(beat: number, [head, ...rest]: ReadonlyArray<Point>, beats: number): BeatmapNote {
  const [x, y] = head ?? [0.5, 0.5];
  return {
    x,
    y,
    t: at(beat),
    kind: 'slider',
    path: rest.map(([px, py]) => ({ x: px, y: py })),
    duration: beats * BEAT,
  };
}

/** Marks the first of `notes` as the start of a new constellation. */
function figure(notes: BeatmapNote[]): BeatmapNote[] {
  const [first, ...rest] = notes;
  return first ? [{ ...first, newFigure: true }, ...rest] : [];
}

/**
 * The five points of a star, in the order that draws it in one stroke, and
 * back to the first to close it: six notes, five lines.
 */
function pentagram(cx: number, cy: number, radius: number, rotation: number): Point[] {
  return [0, 2, 4, 1, 3, 0].map((vertex) =>
    polar(cx, cy, radius, rotation + (vertex * 2 * Math.PI) / 5),
  );
}

/** `count` points evenly around a circle, the first at `rotation`. */
function ring(cx: number, cy: number, radius: number, count: number, rotation: number): Point[] {
  return Array.from({ length: count }, (_, i) =>
    polar(cx, cy, radius, rotation + (i * 2 * Math.PI) / count),
  );
}

/** Points along an arc, for sliders that should read as curves. */
function arc(cx: number, cy: number, radius: number, from: number, to: number, segments: number): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) =>
    polar(cx, cy, radius, from + ((to - from) * i) / segments),
  );
}

/** `count` points winding in towards a centre, a fixed angle apart. */
function spiral(
  cx: number,
  cy: number,
  count: number,
  outer: number,
  inner: number,
  start: number,
  turn: number,
): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const k = i / (count - 1);
    return polar(cx, cy, outer + (inner - outer) * k, start + turn * i);
  });
}

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;

/*
 * Where each figure lives. The final phase visits all of them, so they are
 * named once here rather than repeated as numbers.
 */
const DIPPER = { x: 0.33, y: 0.3 };
const SPIRAL = { x: 0.74, y: 0.56 };
const CORE = { x: 0.5, y: 0.48 };
const SMALL_STAR = { x: 0.2, y: 0.7 };
const RING = { x: 0.8, y: 0.27 };

/* -------------------------------------------------------------------------- */
/* Dusk: the Dipper, handle first, in the top left. The slider closes the     */
/* bowl, so the last line of the figure is the one the player drags.          */
/* -------------------------------------------------------------------------- */
const dusk: BeatmapNote[] = [
  ...chain(
    0,
    [
      [0.12, 0.16],
      [0.2, 0.2],
      [0.28, 0.25],
      [0.36, 0.3],
      [0.37, 0.44],
      [0.52, 0.45],
    ],
    3,
  ),
  slider(
    18,
    [
      [0.54, 0.31],
      [0.36, 0.3],
    ],
    2,
  ),
];

/* -------------------------------------------------------------------------- */
/* Rise: a spiral winding in on the right while the sky goes to warp, then a  */
/* shooting star along the bottom and a single star where the drop will hit.  */
/* -------------------------------------------------------------------------- */
const rise: BeatmapNote[] = [
  ...chain(24, spiral(SPIRAL.x, SPIRAL.y, 8, 0.15, 0.04, Math.PI, (4 * Math.PI) / 9), 2),
  slider(
    40,
    [
      [0.62, 0.84],
      [0.3, 0.64],
    ],
    2,
  ),
  circle(44, [CORE.x, CORE.y]),
];

/* -------------------------------------------------------------------------- */
/* Supernova: the drop. A star in the middle, then a halo dragged over it, a  */
/* second star -- smaller, upside down and faster at 1.5 beats, but over hops */
/* half as long -- a comet across the sky, a ring, and back to the core. Each */
/* is a figure of its own, and each slider is the breath between two.         */
/* -------------------------------------------------------------------------- */
const supernova: BeatmapNote[] = [
  ...chain(48, pentagram(CORE.x, CORE.y, 0.16, UP), 2),
  // The halo, right to left over the top of the star.
  { ...slider(60, arc(CORE.x, CORE.y, 0.22, 2 * Math.PI, Math.PI, 8), 4), newFigure: true },
  ...figure(chain(66, pentagram(SMALL_STAR.x, SMALL_STAR.y, 0.09, DOWN), 1.5)),
  {
    ...slider(
      76,
      [
        [0.3, 0.8],
        [0.68, 0.32],
      ],
      2,
    ),
    newFigure: true,
  },
  ...figure(chain(80, ring(RING.x, RING.y, 0.09, 6, UP), 2)),
  { ...circle(92, [CORE.x, CORE.y]), newFigure: true },
];

/* -------------------------------------------------------------------------- */
/* Afterglow: slow. A crescent moon to drag in the bottom right, then one star */
/* on each figure the run drew, linked into one last line across the sky,     */
/* ending on the core.                                                         */
/* -------------------------------------------------------------------------- */
const afterglow: BeatmapNote[] = [
  slider(96, arc(0.76, 0.66, 0.1, -0.55 * Math.PI, 0.55 * Math.PI, 10), 6),
  ...figure(
    chain(
      106,
      [
        [RING.x, RING.y],
        [DIPPER.x, DIPPER.y],
        [SMALL_STAR.x, SMALL_STAR.y],
        [SPIRAL.x, SPIRAL.y],
      ],
      4,
    ),
  ),
  circle(124, [CORE.x, CORE.y]),
];

/**
 * Each phase starts on the beat of its first note: the music changes section
 * there, and the banner and the new sky arrive with the note's ring.
 */
const phases: BeatmapPhase[] = [
  {
    id: 'dusk',
    name: 'Dusk',
    hint: 'Every note you hit becomes a star. Link them up.',
    start: 0,
    approachTime: 2.0,
    hitWindowScale: 2.6,
    targetScale: 1.3,
    color: '#7DD3FC',
    sky: { color: '#120E2B', pulse: 0.25 },
  },
  {
    id: 'rise',
    name: 'Rise',
    hint: 'The sky is speeding up. Stay on the beat.',
    start: at(24),
    approachTime: 1.6,
    hitWindowScale: 1.9,
    targetScale: 1.15,
    color: '#A78BFA',
    sky: { color: '#1D1246', warp: 1, pulse: 0.6 },
  },
  {
    id: 'supernova',
    name: 'Supernova',
    hint: 'Draw the star. Do not break the line.',
    start: at(48),
    approachTime: 1.25,
    hitWindowScale: 1.4,
    targetScale: 1,
    color: '#FFB347',
    sky: { color: '#2B0A3D', warp: 0.3, pulse: 1, rays: true },
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    hint: 'Look up: everything you drew is still there.',
    start: at(96),
    approachTime: 1.8,
    hitWindowScale: 2.2,
    targetScale: 1.2,
    color: '#99F6E4',
    sky: { color: '#071A2A', pulse: 0.2 },
  },
];

export const constellationBeatmap: Beatmap = {
  id: 'constellation',
  title: 'Constellation',
  author: 'fingertune',
  bpm: BPM,
  soundtrack: 'constellation',
  phases,
  notes: [...dusk, ...rise, ...supernova, ...afterglow].sort((a, b) => a.t - b.t),
};
