/**
 * Duet (~95 s at 110 BPM) — both hands.
 *
 * The map is split down the middle: left-hand notes never leave the left third,
 * right-hand notes never leave the right third. That separation is the whole
 * mechanism. Nothing in the engine checks which hand hit what — it tests
 * position — so what makes this a two-handed map is simply that no single hand
 * can be in both places at once.
 *
 * Enforcing the hand in code would be worse than useless. MediaPipe reports
 * handedness from a mirrored image and gets it wrong often enough that a
 * correct hit would sometimes be judged a miss for having been made by the
 * "wrong" hand, which is unexplainable to a player.
 *
 * PACE. Each hand keeps the same floor as a one-handed map -- around 0.65 s
 * between its own notes -- so the map is twice as dense overall without asking
 * either hand to do anything a hand cannot do. Two hands is a coordination
 * problem, not a speed one, and stacking both makes a map nobody finishes.
 *
 * The three phases are three kinds of coordination:
 *   1. Mirror     — both hands at once, symmetric. Two hands, one gesture.
 *   2. Alternate  — hands take turns. The hard part is the hand that is NOT
 *                   moving staying open, because a resting hand drifts closed
 *                   and fires the moment it is asked for.
 *   3. Independent— one hand holds a slider while the other taps circles. This
 *                   is the real difficulty of the map and it arrives last.
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 110;
const BEAT = 60 / BPM; // ~0.545 s
const INTRO = 2;

const at = (beat: number): number => INTRO + beat * BEAT;

/** Left hand stays left of centre, right hand right of it. */
const LEFT_X = [0.16, 0.36] as const;
const RIGHT_X = [0.64, 0.84] as const;

const lerp = (range: readonly [number, number], u: number): number =>
  range[0] + (range[1] - range[0]) * u;

/**
 * One note for one hand.
 * @param u 0..1 across that hand's own third of the playfield.
 */
function note(hand: 'left' | 'right', beat: number, u: number, y: number): BeatmapNote {
  return { x: lerp(hand === 'left' ? LEFT_X : RIGHT_X, u), y, t: at(beat), hand };
}

/** The same note on both hands, mirrored. */
function pair(beat: number, u: number, y: number): BeatmapNote[] {
  return [note('left', beat, 1 - u, y), note('right', beat, u, y)];
}

/** A slider for one hand, along its own side. */
function hold(
  hand: 'left' | 'right',
  beat: number,
  points: ReadonlyArray<readonly [number, number]>,
  beats: number,
): BeatmapNote[] {
  const range = hand === 'left' ? LEFT_X : RIGHT_X;
  const mapped = points.map(([u, y]) => ({ x: lerp(range, u), y }));
  const [head, ...rest] = mapped;
  if (!head) return [];
  return [
    {
      x: head.x,
      y: head.y,
      t: at(beat),
      kind: 'slider',
      path: rest,
      duration: beats * BEAT,
      hand,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Phase 1 — Mirror: both hands together, symmetric. One gesture, twice.       */
/* -------------------------------------------------------------------------- */
const mirror: BeatmapNote[] = [
  ...pair(0, 0.5, 0.5),
  ...pair(4, 0.2, 0.5),
  ...pair(8, 0.8, 0.5),
  ...pair(12, 0.5, 0.38),
  ...pair(16, 0.5, 0.62),
  ...pair(20, 0.2, 0.44),
  ...pair(24, 0.8, 0.56),
  ...pair(28, 0.5, 0.5),
];

/* -------------------------------------------------------------------------- */
/* Phase 2 — Alternate: hands take turns, two beats apart each.                */
/*                                                                            */
/* Each hand still gets four beats between its own notes; it is the combined   */
/* stream that doubles. The difficulty is not speed, it is that the waiting    */
/* hand has to stay open -- a resting hand drifts closed and fires early.      */
/* -------------------------------------------------------------------------- */
const alternate: BeatmapNote[] = [
  note('left', 34, 0.5, 0.5),
  note('right', 36, 0.5, 0.5),
  note('left', 38, 0.2, 0.42),
  note('right', 40, 0.8, 0.42),
  note('left', 42, 0.8, 0.58),
  note('right', 44, 0.2, 0.58),
  note('left', 46, 0.5, 0.36),
  note('right', 48, 0.5, 0.64),
  note('left', 50, 0.3, 0.5),
  note('right', 52, 0.7, 0.5),
  note('left', 54, 0.7, 0.44),
  note('right', 56, 0.3, 0.44),
  ...pair(60, 0.5, 0.5),
  note('left', 63, 0.2, 0.56),
  note('right', 65, 0.8, 0.56),
  note('left', 67, 0.6, 0.4),
  note('right', 69, 0.4, 0.4),
];

/* -------------------------------------------------------------------------- */
/* Phase 3 — Independent: one hand holds, the other taps.                      */
/*                                                                            */
/* The circles are spaced generously here. Holding a pinch steady while the    */
/* other hand works is hard enough on its own, and every extra note is one     */
/* more chance for the held hand to twitch open.                               */
/* -------------------------------------------------------------------------- */
const independent: BeatmapNote[] = [
  ...hold(
    'left',
    74,
    [
      [0.2, 0.5],
      [0.8, 0.5],
    ],
    6,
  ),
  note('right', 75, 0.3, 0.44),
  note('right', 77.5, 0.7, 0.44),
  note('right', 80, 0.5, 0.6),

  ...hold(
    'right',
    84,
    [
      [0.8, 0.44],
      [0.2, 0.56],
    ],
    6,
  ),
  note('left', 85, 0.7, 0.42),
  note('left', 87.5, 0.3, 0.42),
  note('left', 90, 0.5, 0.6),

  // Both hands hold at once, to finish.
  ...hold(
    'left',
    95,
    [
      [0.25, 0.42],
      [0.75, 0.58],
    ],
    6,
  ),
  ...hold(
    'right',
    95,
    [
      [0.75, 0.42],
      [0.25, 0.58],
    ],
    6,
  ),
  ...pair(104, 0.5, 0.5),
];

const phases: BeatmapPhase[] = [
  {
    id: 'mirror',
    name: 'Mirror',
    hint: 'Both hands, together. Left side is your left hand.',
    start: 0,
    approachTime: 2,
    hitWindowScale: 2.5,
    targetScale: 1.3,
  },
  {
    id: 'alternate',
    name: 'Alternate',
    hint: 'Hands take turns. Keep the waiting one open.',
    start: at(34) - INTRO,
    approachTime: 1.6,
    hitWindowScale: 1.7,
    targetScale: 1.15,
  },
  {
    id: 'independent',
    name: 'Independent',
    hint: 'One hand holds, the other taps.',
    start: at(74) - INTRO,
    approachTime: 1.4,
    hitWindowScale: 1.4,
    targetScale: 1.05,
  },
];

export const duetBeatmap: Beatmap = {
  id: 'duet',
  title: 'Duet',
  author: 'qthullie',
  bpm: BPM,
  phases,
  notes: [...mirror, ...alternate, ...independent].sort((a, b) => a.t - b.t),
};
