/**
 * Reads a StepMania chart (.sm) into a Fingertune beatmap.
 *
 * StepMania is the other large open chart library, and unlike osu! it is not
 * shaped like this game at all: it is four fixed lanes and a scrolling field,
 * where this is a hand moving freely in a rectangle. So this conversion makes
 * decisions a mapper never made, and they are worth naming rather than hiding.
 *
 * - **Lanes become columns.** Left, down, up and right land at four fixed
 *   x positions. That part is honest: the chart's left-right structure, which
 *   is most of what a stepchart expresses, survives intact.
 * - **Height is invented.** A stepchart has no vertical dimension — every note
 *   is on the same receptor line. Placing them all at one height would make a
 *   chart that is played entirely with sideways motion, which is dull and hides
 *   what the tracker can do. So y follows a slow wave over the beat: the
 *   rhythm is the mapper's, the height is this file's.
 * - **Holds become short drags.** A hold is the same arrow held down; there is
 *   nowhere for it to travel. It comes across as a slider that moves a short
 *   way down the screen over the hold's own duration, because holding a pinch
 *   still is not something this game can judge.
 * - **Mines, rolls and lifts are dropped.** Each is a rule this game does not
 *   have, and converting one into a note would punish the player for something
 *   the chart never asked.
 *
 * Only the first `#NOTES` block of a `dance-single` chart is read. A .sm holds
 * every difficulty in one file, and picking silently is worse than picking
 * first — so the block's own difficulty name is reported back to the UI.
 */

import type { Beatmap, BeatmapNote, BeatmapPhase, Vec2 } from '../game/types';

export class StepmaniaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepmaniaParseError';
  }
}

/** Where each of the four lanes sits across the playfield. */
const LANE_X = [0.16, 0.38, 0.62, 0.84];
/** How far a hold travels down the screen, as a fraction of the playfield. */
const HOLD_TRAVEL = 0.2;

interface BpmChange {
  beat: number;
  bpm: number;
}

export interface SmChart {
  beatmap: Beatmap;
  /** Filename of the track the chart expects, as written in #MUSIC. */
  audioFilename: string;
  label: string;
}

/** `#TAG:value;` — values may span lines, which is why this is not a regex per line. */
function readTags(text: string): Map<string, string> {
  const tags = new Map<string, string>();
  const pattern = /#([A-Za-z0-9_]+):([\s\S]*?);/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1]?.toUpperCase();
    // #NOTES appears several times, once per difficulty; keep the first.
    if (key && !tags.has(key)) tags.set(key, (match[2] ?? '').trim());
  }
  return tags;
}

/** `#BPMS:0.000=120.000,64.000=140.000;` */
function readBpms(raw: string | undefined): BpmChange[] {
  const changes: BpmChange[] = [];
  for (const pair of (raw ?? '').split(',')) {
    const [beat, bpm] = pair.split('=').map((value) => Number(value.trim()));
    if (Number.isFinite(beat) && Number.isFinite(bpm) && (bpm as number) > 0) {
      changes.push({ beat: beat as number, bpm: bpm as number });
    }
  }
  if (changes.length === 0) changes.push({ beat: 0, bpm: 120 });
  return changes.sort((a, b) => a.beat - b.beat);
}

/**
 * Turns a beat number into seconds, walking the BPM changes.
 *
 * Built once as a closure over a running total rather than integrated per note:
 * a chart with a hundred BPM changes and three thousand notes would otherwise
 * be a hundred thousand multiplications for a number that only moves forward.
 */
function beatToSecond(changes: BpmChange[], offsetSeconds: number): (beat: number) => number {
  const marks: Array<{ beat: number; second: number; bpm: number }> = [];
  let second = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i] as BpmChange;
    if (i > 0) {
      const previous = changes[i - 1] as BpmChange;
      second += ((change.beat - previous.beat) * 60) / previous.bpm;
    }
    marks.push({ beat: change.beat, second, bpm: change.bpm });
  }

  return (beat: number): number => {
    let mark = marks[0] as { beat: number; second: number; bpm: number };
    for (const candidate of marks) {
      if (candidate.beat > beat) break;
      mark = candidate;
    }
    // StepMania's #OFFSET is the gap from the file's start to beat 0, and it is
    // written as a negative number when the audio starts first.
    return mark.second + ((beat - mark.beat) * 60) / mark.bpm - offsetSeconds;
  };
}

/** The vertical wave. Slow enough to read, wide enough to be worth moving for. */
function laneY(beat: number): number {
  return 0.5 + 0.26 * Math.sin(beat * 0.28);
}

export interface SmImportOptions {
  id?: string;
}

/**
 * Converts the first dance-single chart in a .sm file.
 *
 * @throws StepmaniaParseError when there is no such chart, or it has no note.
 */
export function parseStepmania(text: string, options: SmImportOptions = {}): SmChart {
  const tags = readTags(text);

  // #NOTES has six colon-separated fields; the sixth is the note data itself.
  const blocks = [...text.matchAll(/#NOTES:([\s\S]*?);/g)];
  const single = blocks
    .map((block) => (block[1] ?? '').split(':').map((field) => field.trim()))
    .find((fields) => fields[0]?.startsWith('dance-single'));

  if (!single || !single[5]) {
    throw new StepmaniaParseError('No dance-single chart found in this file.');
  }

  const changes = readBpms(tags.get('BPMS'));
  const toSecond = beatToSecond(changes, Number(tags.get('OFFSET') ?? 0) || 0);

  const measures = single[5]
    .split(',')
    .map((measure) => measure.split(/\s+/).filter((row) => /^[0-9MLF]+$/.test(row)));

  const notes: BeatmapNote[] = [];
  /** Lane -> the beat its hold started on, while one is open. */
  const openHolds = new Map<number, number>();

  measures.forEach((rows, measureIndex) => {
    if (rows.length === 0) return;
    rows.forEach((row, rowIndex) => {
      const beat = measureIndex * 4 + (rowIndex / rows.length) * 4;

      for (let lane = 0; lane < LANE_X.length; lane++) {
        const symbol = row[lane];
        if (!symbol || symbol === '0') continue;

        if (symbol === '2' || symbol === '4') {
          // Hold or roll head. A roll is a repeated tap in StepMania; here both
          // are just "keep hold of it", which is the closest gesture available.
          openHolds.set(lane, beat);
          continue;
        }

        if (symbol === '3') {
          const startBeat = openHolds.get(lane);
          openHolds.delete(lane);
          if (startBeat === undefined) continue;
          const start = toSecond(startBeat);
          const duration = Math.max(0.12, toSecond(beat) - start);
          const x = LANE_X[lane] as number;
          const y = laneY(startBeat);
          const path: Vec2[] = [{ x, y: Math.min(0.94, y + HOLD_TRAVEL) }];
          notes.push({ x, y, t: start, kind: 'slider', path, duration });
          continue;
        }

        // '1' is a tap. 'M' is a mine, 'L' a lift, 'F' a fake: all dropped.
        if (symbol === '1') {
          notes.push({ x: LANE_X[lane] as number, y: laneY(beat), t: toSecond(beat) });
        }
      }
    });
  });

  if (notes.length === 0) throw new StepmaniaParseError('The chart has no playable steps.');
  notes.sort((a, b) => a.t - b.t);

  const difficultyName = single[2] || 'Imported';
  const title = tags.get('TITLE') || 'Untitled';
  const artist = tags.get('ARTIST') || 'Unknown';

  const phase: BeatmapPhase = {
    id: 'sm',
    name: difficultyName,
    hint: 'Imported from StepMania. Four lanes, height added by the importer.',
    start: 0,
    approachTime: 1.4,
    hitWindowScale: 1.4,
    targetScale: 1,
  };

  return {
    audioFilename: tags.get('MUSIC') ?? '',
    label: `${artist} — ${title}`,
    beatmap: {
      id: options.id ?? 'sm-import',
      title: `${title} [${difficultyName}]`,
      author: tags.get('CREDIT') || artist,
      bpm: Math.round((changes[0] as BpmChange).bpm),
      phases: [phase],
      notes,
    },
  };
}
