/**
 * Reads an osu! chart into a Fingertune beatmap.
 *
 * The point is the catalogue. Authoring a chart by hand takes an evening per
 * minute of music, so a game that only plays its own four maps is a game with
 * four maps forever. osu! has a public library of hundreds of thousands, in a
 * plain-text format that has barely changed since 2014, and the two games ask
 * for close enough to the same thing: hit this circle on this beat, then drag
 * along this path.
 *
 * What comes across, and what does not:
 *
 * - **Circles** map exactly. Position, time, nothing lost.
 * - **Sliders** map as polylines. osu! draws Bézier, Catmull and perfect-circle
 *   arcs through their control points; this reads the control points as a path
 *   and walks it. Straight sliders are exact, curved ones cut the corner. The
 *   game judges a slider on the fraction of the ball you followed, and the ball
 *   runs along whatever path is here, so a cut corner changes the shape you
 *   trace rather than making the note unfair.
 * - **Spinners are dropped.** There is no spin gesture, and turning one into a
 *   circle would invent a note the mapper never wrote.
 * - **Difficulty comes across as numbers, not as feel.** AR becomes the
 *   approach time, OD the timing windows, CS the target size — through osu!'s
 *   own published formulas. What cannot come across is that osu! is played with
 *   a tablet and this is played with a hand in the air, so a chart that is
 *   comfortable there is usually a tier harder here.
 *
 * Format reference: the osu! file format (v14), sections [General], [Metadata],
 * [Difficulty], [TimingPoints] and [HitObjects].
 */

import type { Beatmap, BeatmapNote, BeatmapPhase, Vec2 } from '../game/types';

/** osu!'s playfield, in its own units. Every position is scaled out of this. */
const OSU_WIDTH = 512;
const OSU_HEIGHT = 384;

/** Bit flags in a hit object's type field. */
const TYPE_CIRCLE = 1;
const TYPE_SLIDER = 2;
const TYPE_SPINNER = 8;

export class OsuParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OsuParseError';
  }
}

interface TimingPoint {
  time: number;
  /** Milliseconds per beat. Only uninherited points carry a real one. */
  beatLength: number;
  /** Slider velocity multiplier from an inherited point (1 when uninherited). */
  velocity: number;
  uninherited: boolean;
}

export interface OsuChart {
  beatmap: Beatmap;
  /** Filename of the track the chart expects, as written in [General]. */
  audioFilename: string;
  /** Artist and title, for showing what was loaded. */
  label: string;
}

/* ------------------------------------------------------------------ parsing -- */

function splitSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;

    const header = /^\[(.+)\]$/.exec(line);
    if (header?.[1]) {
      current = [];
      sections.set(header[1], current);
      continue;
    }
    current?.push(line);
  }
  return sections;
}

/** `Key: value` lines, as used by [General], [Metadata] and [Difficulty]. */
function readPairs(lines: string[] | undefined): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const line of lines ?? []) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    pairs.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return pairs;
}

function num(pairs: Map<string, string>, key: string, fallback: number): number {
  const value = Number(pairs.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function readTimingPoints(lines: string[] | undefined): TimingPoint[] {
  const points: TimingPoint[] = [];
  for (const line of lines ?? []) {
    const parts = line.split(',');
    const time = Number(parts[0]);
    const beatLength = Number(parts[1]);
    if (!Number.isFinite(time) || !Number.isFinite(beatLength)) continue;

    // An uninherited point carries milliseconds per beat. An inherited one
    // carries a negative number whose reciprocal is a speed multiplier: -50
    // means 200%. The flag is field 6, and files older than v5 omit it — in
    // which case the sign is the only thing left to go on.
    const flag = parts[6];
    const uninherited = flag === undefined ? beatLength > 0 : flag === '1';

    points.push({
      time,
      beatLength: uninherited ? beatLength : 0,
      velocity: uninherited ? 1 : 100 / -beatLength,
      uninherited,
    });
  }
  return points.sort((a, b) => a.time - b.time);
}

/** The timing in force at `time`: the last uninherited beat, the last velocity. */
function timingAt(points: TimingPoint[], time: number): { beatLength: number; velocity: number } {
  let beatLength = 500; // 120 BPM, if the file gives us nothing
  let velocity = 1;
  for (const point of points) {
    if (point.time > time) break;
    if (point.uninherited) {
      beatLength = point.beatLength;
      velocity = 1; // an uninherited point resets the multiplier
    } else {
      velocity = point.velocity;
    }
  }
  return { beatLength, velocity };
}

/**
 * Walks a control-point polyline to a given length, sampling as it goes.
 *
 * osu! defines a slider by a curve and a pixel length, and the two disagree:
 * the length may stop short of the last control point, or ask for more than the
 * points describe, in which case the tail is extended along its final
 * direction. Both cases happen in real charts, so both are handled.
 */
function walkPath(points: Vec2[], targetLength: number, samples: number): Vec2[] {
  if (points.length < 2) return points;

  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(total);
  }
  if (total <= 0) return points;

  const at = (distance: number): Vec2 => {
    if (distance <= 0) return points[0] as Vec2;
    if (distance >= total) {
      // Past the end: keep going along the last segment's direction.
      const last = points[points.length - 1] as Vec2;
      const previous = points[points.length - 2] as Vec2;
      const dx = last.x - previous.x;
      const dy = last.y - previous.y;
      const len = Math.hypot(dx, dy) || 1;
      const over = distance - total;
      return { x: last.x + (dx / len) * over, y: last.y + (dy / len) * over };
    }
    let i = 1;
    while (i < lengths.length && (lengths[i] as number) < distance) i++;
    const a = points[i - 1] as Vec2;
    const b = points[i] as Vec2;
    const from = lengths[i - 1] as number;
    const span = (lengths[i] as number) - from || 1;
    const k = (distance - from) / span;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };

  const out: Vec2[] = [];
  for (let i = 0; i <= samples; i++) out.push(at((targetLength * i) / samples));
  return out;
}

/* ---------------------------------------------------------------- difficulty -- */

/**
 * osu!'s own difficulty formulas, kept in one place and named.
 *
 * These are not estimates. AR, OD and CS are defined by exactly these
 * piecewise-linear maps, and anything else would make an imported chart play
 * differently from the chart the mapper tested.
 */
const osuDifficulty = {
  /** Approach rate to the time a note is visible before its beat, in ms. */
  preemptMs(ar: number): number {
    if (ar < 5) return 1200 + (600 * (5 - ar)) / 5;
    if (ar > 5) return 1200 - (750 * (ar - 5)) / 5;
    return 1200;
  },
  /** Overall difficulty to the 300-window, in ms. */
  perfectMs(od: number): number {
    return 80 - 6 * od;
  },
  /** Overall difficulty to the 100-window, in ms. */
  goodMs(od: number): number {
    return 140 - 8 * od;
  },
  /** Circle size to a radius, in osu! pixels. */
  radiusPx(cs: number): number {
    return 54.4 - 4.48 * cs;
  },
};

/* ------------------------------------------------------------------- import -- */

export interface ImportOptions {
  /** Id to give the resulting beatmap. Defaults to a slug of the file name. */
  id?: string;
  /** Our own defaults, so the conversion can be expressed relative to them. */
  baseWindowPerfect: number;
  baseTargetRadius: number;
}

/**
 * Converts one .osu file into a beatmap the engine can run.
 *
 * @throws OsuParseError when the file is not a chart, or has no playable note.
 */
export function parseOsu(text: string, options: ImportOptions): OsuChart {
  if (!/^﻿?osu file format v\d+/m.test(text)) {
    throw new OsuParseError('This does not look like an .osu chart.');
  }

  const sections = splitSections(text);
  const general = readPairs(sections.get('General'));
  const metadata = readPairs(sections.get('Metadata'));
  const difficulty = readPairs(sections.get('Difficulty'));
  const timing = readTimingPoints(sections.get('TimingPoints'));
  const objects = sections.get('HitObjects') ?? [];

  if (objects.length === 0) throw new OsuParseError('The chart has no hit objects.');

  const ar = num(difficulty, 'ApproachRate', num(difficulty, 'OverallDifficulty', 5));
  const od = num(difficulty, 'OverallDifficulty', 5);
  const cs = num(difficulty, 'CircleSize', 4);
  const sliderMultiplier = num(difficulty, 'SliderMultiplier', 1.4);

  const notes: BeatmapNote[] = [];
  let firstTime = Infinity;

  for (const line of objects) {
    const parts = line.split(',');
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const timeMs = Number(parts[2]);
    const type = Number(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(timeMs)) continue;
    if ((type & TYPE_SPINNER) !== 0) continue;

    firstTime = Math.min(firstTime, timeMs);
    const head: Vec2 = { x: x / OSU_WIDTH, y: y / OSU_HEIGHT };

    if ((type & TYPE_SLIDER) !== 0 && parts[5]) {
      // "B|x:y|x:y", then slides, then pixel length.
      const [, ...rawPoints] = parts[5].split('|');
      const control: Vec2[] = [{ x, y }];
      for (const point of rawPoints) {
        const [px, py] = point.split(':').map(Number);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          control.push({ x: px as number, y: py as number });
        }
      }

      const slides = Math.max(1, Number(parts[6]) || 1);
      const pixelLength = Number(parts[7]);
      const { beatLength, velocity } = timingAt(timing, timeMs);
      const speed = sliderMultiplier * 100 * velocity; // osu! pixels per beat

      if (Number.isFinite(pixelLength) && pixelLength > 0 && speed > 0) {
        const oneSlide = (pixelLength / speed) * beatLength; // ms
        // Repeats are folded into the travel time rather than modelled: the
        // game has no notion of a ball bouncing back, and a longer hold along
        // the same path is the closest honest equivalent.
        const durationMs = oneSlide * slides;
        const sampled = walkPath(control, pixelLength, 24).map((p) => ({
          x: p.x / OSU_WIDTH,
          y: p.y / OSU_HEIGHT,
        }));

        notes.push({
          ...head,
          t: timeMs / 1000,
          kind: 'slider',
          path: sampled.slice(1),
          duration: durationMs / 1000,
        });
        continue;
      }
    }

    if ((type & TYPE_CIRCLE) !== 0 || (type & TYPE_SLIDER) !== 0) {
      notes.push({ ...head, t: timeMs / 1000 });
    }
  }

  if (notes.length === 0) throw new OsuParseError('The chart has no circles or sliders.');

  notes.sort((a, b) => a.t - b.t);

  const { beatLength } = timingAt(timing, firstTime);
  const bpm = beatLength > 0 ? Math.round(60000 / beatLength) : 120;

  const phase: BeatmapPhase = {
    id: 'osu',
    name: metadata.get('Version') || 'Imported',
    hint: 'Imported from osu!. Spinners were dropped.',
    start: 0,
    approachTime: osuDifficulty.preemptMs(ar) / 1000,
    hitWindowScale: osuDifficulty.perfectMs(od) / 1000 / options.baseWindowPerfect,
    targetScale: osuDifficulty.radiusPx(cs) / OSU_HEIGHT / options.baseTargetRadius,
  };

  const artist = metadata.get('Artist') || 'Unknown';
  const title = metadata.get('Title') || 'Untitled';

  return {
    audioFilename: general.get('AudioFilename') ?? '',
    label: `${artist} — ${title}`,
    beatmap: {
      id: options.id ?? 'osu-import',
      title: `${title} [${metadata.get('Version') || 'osu!'}]`,
      author: metadata.get('Creator') || artist,
      bpm,
      phases: [phase],
      notes,
    },
  };
}
