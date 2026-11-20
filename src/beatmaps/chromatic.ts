/**
 * Chromatic (~84 s at 120 BPM): five colour-coded phases, Geometry Dash style,
 * at the Demo's pace.
 *
 *   1. Spark   amber   6-beat spacing, like Demo Easy. Cracked circles appear.
 *   2. Ignite  red     4-beat spacing. Flame walls start closing in.
 *   3. Surge   cyan    2.5-beat zigzag, like Demo Medium.
 *   4. Float   violet  long arcing sliders.
 *   5. GLORY   gold    2-beat finale, narrowest corridor.
 *
 * Cracked circles (`hazard`) must not be pinched. Flame walls grow steadily
 * from phase 2 (see `BeatmapPhase.fire`); every note stays well clear of them.
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 120;
const BEAT = 60 / BPM; // 0.5 s
const INTRO = 2;

const at = (beat: number): number => INTRO + beat * BEAT;

function circle(beat: number, x: number, y: number): BeatmapNote {
  return { x, y, t: at(beat) };
}

function hazard(beat: number, x: number, y: number): BeatmapNote {
  return { x, y, t: at(beat), kind: 'hazard' };
}

function sweep(
  beat: number,
  points: ReadonlyArray<readonly [number, number]>,
  durationBeats: number,
): BeatmapNote {
  const head = points[0]!;
  return {
    x: head[0],
    y: head[1],
    t: at(beat),
    kind: 'slider',
    path: points.slice(1).map(([x, y]) => ({ x, y })),
    duration: durationBeats * BEAT,
  };
}

const phases: BeatmapPhase[] = [
  { id: 'spark',  name: 'Spark',  hint: 'Pinch on the beat. Never pinch a cracked circle.',                       start: 0,       approachTime: 2.6, hitWindowScale: 3.0, targetScale: 1.05,  color: '#F59E0B', psychedelic: true },
  { id: 'ignite', name: 'Ignite', hint: 'Flames close in from the sides. Keep your hands in the middle.',         start: at(48),  approachTime: 2.0, hitWindowScale: 2.0, targetScale: 0.9,   color: '#EF4444', psychedelic: true, fire: 0.06 },
  { id: 'surge',  name: 'Surge',  hint: 'Faster, and the flames keep growing.',                                   start: at(80),  approachTime: 1.6, hitWindowScale: 1.8, targetScale: 0.87,                    psychedelic: true, fire: 0.1 },
  { id: 'float',  name: 'Float',  hint: 'Long arcs. Stay on the ball, away from the fire.',                       start: at(106), approachTime: 1.3, hitWindowScale: 1.4, targetScale: 0.825, color: '#8B5CF6', psychedelic: true, fire: 0.12 },
  { id: 'glory',  name: 'GLORY',  hint: 'Short ring, narrow corridor. Everything at once.',                       start: at(135), approachTime: 1.0, hitWindowScale: 1.0, targetScale: 0.75,  color: '#FBBF24', psychedelic: true, fire: 0.16 },
];

const notes: BeatmapNote[] = [
  // Spark: one note every 6 beats (3 s).
  circle( 4,    0.5,  0.3),
  hazard( 6,    0.1,  0.1),
  circle(10,    0.3,  0.6),
  circle(16,    0.7,  0.4),
  hazard(18,    0.9,  0.1),
  circle(22,    0.5,  0.65),
  circle(28,    0.25, 0.35),
  circle(34,    0.75, 0.55),
  circle(40,    0.5,  0.3),

  // Ignite: every 4 beats, two sweeps. Each slider tail gets 4 beats of recovery.
  circle(48,    0.3,  0.5),
  circle(52,    0.7,  0.35),
  hazard(54,    0.5,  0.08),
  sweep( 56,    [[0.2, 0.3], [0.8, 0.3]], 2),
  circle(62,    0.5,  0.65),
  circle(66,    0.25, 0.4),
  sweep( 70,    [[0.75, 0.5], [0.25, 0.5]], 2),
  circle(76,    0.5,  0.3),

  // Surge: every 2.5 beats, diagonal zigzag.
  circle(80,    0.2,  0.3),
  circle(82.5,  0.8,  0.35),
  circle(85,    0.45, 0.65),
  hazard(86.5,  0.15, 0.5),
  circle(88,    0.75, 0.25),
  circle(90.5,  0.3,  0.55),
  circle(93,    0.6,  0.2),
  sweep( 95.5,  [[0.4, 0.3], [0.7, 0.7]], 2),
  circle(100,   0.5,  0.5),
  circle(102.5, 0.3,  0.4),

  // Float: long arcs, 3 beats between a tail and the next head.
  sweep( 106,   [[0.2, 0.5], [0.5, 0.2], [0.8, 0.5]], 4),
  circle(113,   0.5,  0.65),
  hazard(114.5, 0.88, 0.5),
  sweep( 116,   [[0.8, 0.3], [0.2, 0.3]], 3),
  circle(122,   0.5,  0.5),
  sweep( 125,   [[0.5, 0.2], [0.3, 0.6], [0.7, 0.6]], 3),
  circle(131,   0.5,  0.3),

  // GLORY: every 2 beats, kept inside the narrowed corridor (x 0.25..0.75).
  circle(138,   0.25, 0.3),
  circle(140,   0.75, 0.35),
  hazard(141.5, 0.5,  0.9),
  circle(143,   0.5,  0.65),
  sweep( 145,   [[0.3, 0.4], [0.7, 0.4]], 2),
  circle(149,   0.5,  0.5),
  circle(151,   0.25, 0.3),
  circle(153,   0.75, 0.6),
  sweep( 155,   [[0.5, 0.2], [0.5, 0.7]], 2),
  circle(159,   0.3,  0.5),
  circle(161,   0.7,  0.3),
  circle(163,   0.5,  0.65),
];

export const chromaticBeatmap: Beatmap = {
  id: 'chromatic',
  title: 'Chromatic',
  author: 'fingertune',
  bpm: BPM,
  phases,
  notes,
};
