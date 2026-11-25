/**
 * The generated soundtracks: what each instrument plays on each eighth note.
 *
 * A soundtrack is a pure arrangement. It owns no instrument and no clock: the
 * AudioEngine calls it once per eighth note with the band and the position,
 * and it triggers whatever that position calls for. Instruments, routing and
 * timing stay in one place (lib/audio.ts), and a new track is a new function.
 *
 * Positions come in two forms because tracks need both. `eighth` counts from
 * the start of the music and keeps a loop in step with itself; `section` and
 * `sinceSection` say where that eighth falls in the beatmap's phases, so a
 * track can be written against the chart the way a song is charted against
 * its sections.
 */

import * as Tone from 'tone';
import type { SoundtrackId } from '../game/types';
import type { SampleDeck } from './sampleDeck';

/** Every instrument a track can play. Built and routed by the AudioEngine. */
export interface Band {
  kick: Tone.MembraneSynth;
  snare: Tone.NoiseSynth;
  hat: Tone.NoiseSynth;
  crash: Tone.NoiseSynth;
  bass: Tone.MonoSynth;
  lead: Tone.PolySynth<Tone.Synth>;
  bell: Tone.PolySynth<Tone.FMSynth>;
  pad: Tone.PolySynth<Tone.Synth>;
  /** The track's recorded sounds, once loaded (see `Soundtrack.samples`). */
  deck: SampleDeck | null;
}

/** Where an eighth note falls. */
export interface Position {
  /** Audio instant to schedule on. */
  time: number;
  /** Eighth notes since the start of the music. */
  eighth: number;
  /** Index of the beatmap phase this eighth belongs to, counted from the map's first. */
  section: number;
  /** Eighth notes since that phase began. */
  sinceSection: number;
}

export interface Soundtrack {
  /** Triggers what the eighth note at `at` calls for. */
  play: (band: Band, at: Position) => void;
  /**
   * Hit sounds, one per step of combo, so a streak climbs a scale. In the
   * track's key: a hit is a note in the song, not a sound on top of it.
   */
  hitScale: readonly string[];
  /**
   * Gain of the music and of the game's own sounds (hits, misses, ticks), in
   * dB. A scene map wants its music in front: a hit is punctuation, not the
   * point.
   */
  levels: { music: number; effects: number };
  /** Recorded sounds to load before the track can play, by name. */
  samples?: Readonly<Record<string, string>>;
  /**
   * A recorded instrument (one of `samples`) to play hits on instead of the
   * synthesised ping, and the note it is tuned to.
   */
  hitInstrument?: { name: string; root: string };
}

/** Shifts a note by whole octaves. */
const octave = (note: string, shift: number): string =>
  Tone.Frequency(note).transpose(12 * shift).toNote();

/* -------------------------------------------------------------------- groove -- */

/** 2 bars of 8 eighth notes, in A minor. */
const GROOVE_BASS = ['A1', 'A1', 'E2', 'A1', 'F1', 'F1', 'C2', 'G1'] as const;
const GROOVE_LEAD = ['A4', 'C5', 'E5', 'C5', 'F4', 'A4', 'C5', 'G4'] as const;
const GROOVE_PADS = [
  ['A3', 'C4', 'E4'],
  ['F3', 'A3', 'C4'],
] as const;

/**
 * The original loop, and every map's track unless it names another.
 *
 * It grows with the phases rather than following them: the first is minimal,
 * the second adds drums and bass, the third and any after it the lead.
 */
function playGroove(band: Band, { time, eighth, section }: Position): void {
  const intensity = Math.min(section, 2);
  const step = eighth % 8;
  const bar = Math.floor(eighth / 8) % 2;

  if (step === 0) band.pad.triggerAttackRelease([...(GROOVE_PADS[bar] ?? GROOVE_PADS[0])], '2n', time);

  if (step % 4 === 0) band.kick.triggerAttackRelease('C1', '8n', time);
  if (intensity >= 1 && step === 4) band.snare.triggerAttackRelease('16n', time);
  if (intensity >= 1 && step % 2 === 1) band.hat.triggerAttackRelease('64n', time);

  if (intensity >= 1) band.bass.triggerAttackRelease(GROOVE_BASS[step] ?? 'A1', '8n', time);

  if (intensity >= 2) {
    const note = GROOVE_LEAD[step] ?? 'A4';
    band.lead.triggerAttackRelease(note, '16n', time);
    if (bar === 1 && step % 2 === 0) {
      band.lead.triggerAttackRelease(note, '32n', time + Tone.Time('16n').toSeconds());
    }
  }
}

/* ------------------------------------------------------------- constellation -- */

/**
 * Bm – G – D – A, one chord a bar: the progression under the whole track, so
 * that four very different sections still sound like one song.
 */
const CHORDS = [
  { root: 'B1', pad: ['B3', 'D4', 'F#4'], arp: ['B4', 'D5', 'F#5', 'B5'] },
  { root: 'G1', pad: ['G3', 'B3', 'D4'], arp: ['G4', 'B4', 'D5', 'G5'] },
  { root: 'D2', pad: ['A3', 'D4', 'F#4'], arp: ['F#4', 'A4', 'D5', 'F#5'] },
  { root: 'A1', pad: ['A3', 'C#4', 'E4'], arp: ['E4', 'A4', 'C#5', 'E5'] },
] as const;

/** The drop's hook, an eighth per entry over the four chords. `null` rests. */
const HOOK: ReadonlyArray<ReadonlyArray<string | null>> = [
  ['F#5', null, 'D5', null, 'E5', 'F#5', null, 'A5'],
  [null, 'G5', 'F#5', null, 'E5', null, 'D5', null],
  ['F#5', null, 'D5', null, 'E5', 'F#5', null, 'A5'],
  ['B5', null, 'A5', null, 'E5', null, 'C#5', null],
];

/** The sections, in the order the Constellation beatmap's phases run. */
const DUSK = 0;
const RISE = 1;
const SUPERNOVA = 2;

/** Eighths in the build-up, and the silence it ends on before the drop. */
const RISE_LENGTH = 48;
const RISE_GAP = 4;

/**
 * Written for the Constellation beatmap, section by section.
 *
 *   Dusk       pad and a sparse bell, 3-3-2 over the bar, a kick on the one.
 *   Rise       four on the floor, the bell climbing in straight eighths, and a
 *              snare roll that doubles its rate every two bars, then two beats
 *              of nothing. That gap is the drop: the ear hears it coming.
 *   Supernova  crash and sub on the downbeat, backbeat, offbeat hats, an
 *              octave-jumping bass and the hook on top.
 *   Afterglow  the pad and the bell, an octave up, with no drums at all.
 */
function playConstellation(band: Band, { time, eighth, section, sinceSection }: Position): void {
  const step = eighth % 8;
  const chord = CHORDS[Math.floor(sinceSection / 8) % CHORDS.length] ?? CHORDS[0];
  const sixteenth = Tone.Time('16n').toSeconds();

  if (section === DUSK) {
    if (step === 0) band.pad.triggerAttackRelease([...chord.pad], '1m', time);
    if (step === 0 || step === 3 || step === 6) {
      band.bell.triggerAttackRelease(chord.arp[step === 0 ? 0 : step === 3 ? 2 : 3] ?? 'B4', '8n', time);
    }
    if (step === 0) band.kick.triggerAttackRelease('B0', '4n', time);
    return;
  }

  if (section === RISE) {
    if (sinceSection >= RISE_LENGTH - RISE_GAP) return;
    const bar = Math.floor(sinceSection / 8);

    if (step === 0) band.pad.triggerAttackRelease([...chord.pad], '1m', time);
    if (step % 2 === 0) band.kick.triggerAttackRelease('B0', '8n', time);
    band.bell.triggerAttackRelease(octave(chord.arp[step % 4] ?? 'B4', bar >= 4 ? 1 : 0), '16n', time);
    band.bass.triggerAttackRelease(chord.root, '16n', time);

    // Quarters, then eighths, then sixteenths: the roll that makes a build-up.
    const roll = bar < 2 ? (step % 2 === 0 ? 1 : 0) : bar < 4 ? 1 : 2;
    const velocity = 0.25 + 0.75 * (sinceSection / RISE_LENGTH);
    for (let i = 0; i < roll; i++) {
      band.snare.triggerAttackRelease('32n', time + i * sixteenth, velocity);
    }
    return;
  }

  if (section === SUPERNOVA) {
    if (sinceSection === 0) {
      band.crash.triggerAttackRelease('1n', time);
      band.kick.triggerAttackRelease('B0', '2n', time);
    } else if (step % 2 === 0) {
      band.kick.triggerAttackRelease('B0', '8n', time);
    }
    if (step === 0) band.pad.triggerAttackRelease([...chord.pad], '1m', time);
    if (step === 2 || step === 6) band.snare.triggerAttackRelease('16n', time);
    if (step % 2 === 1) band.hat.triggerAttackRelease('64n', time);
    band.bass.triggerAttackRelease(octave(chord.root, step % 2), '16n', time);

    const note = HOOK[Math.floor(sinceSection / 8) % HOOK.length]?.[step];
    if (note) {
      band.lead.triggerAttackRelease(note, '8n', time);
      band.bell.triggerAttackRelease(octave(note, 1), '16n', time, 0.5);
    }
    return;
  }

  // Afterglow, and anything past it.
  if (step === 0) band.pad.triggerAttackRelease([...chord.pad], '1m', time);
  if (step === 0 || step === 3 || step === 6) {
    band.bell.triggerAttackRelease(octave(chord.arp[step === 0 ? 3 : step === 3 ? 2 : 0] ?? 'B5', 1), '4n', time, 0.6);
  }
}

export const soundtracks: Record<SoundtrackId, Soundtrack> = {
  groove: {
    play: playGroove,
    hitScale: ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'],
    levels: { music: 0, effects: 0 },
  },
  // D major pentatonic: consonant over all four chords of the progression.
  constellation: {
    play: playConstellation,
    hitScale: ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6'],
    levels: { music: 2, effects: -6 },
  },
};
