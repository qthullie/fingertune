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
import { pitchesOf, soundSet } from './sounds';

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
  /**
   * How a freeze (see `Beatmap.freezes`) sounds, from the track's samples: a
   * sound as it begins, a chord held over the stillness, and a sound as it
   * lets go. Without one, a freeze is only the music fading out and back.
   */
  /** A recorded sound to play when a slider's head is caught. */
  sliderStart?: string;
  freeze?: {
    begin: string;
    chord: ReadonlyArray<{ name: string; root: string; note: string }>;
    end: string;
  };
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

/** The note each of Constellation's instruments is tuned to. */
const TUNED = pitchesOf('constellation');

/**
 * D – Bm – G – A, a chord a bar: the progression under the whole waltz, so
 * that four very different sections still sound like one song. `bass` is the
 * harp's low note, `chord` the pizzicato's two beats, `arp` the harp's run.
 */
const CHORDS = [
  { bass: 'D3', chord: ['F#4', 'A4', 'D5'], arp: ['D5', 'F#5', 'A5', 'D6'] },
  { bass: 'B2', chord: ['D4', 'F#4', 'B4'], arp: ['B4', 'D5', 'F#5', 'B5'] },
  { bass: 'G2', chord: ['D4', 'G4', 'B4'], arp: ['G4', 'B4', 'D5', 'G5'] },
  { bass: 'A2', chord: ['C#4', 'E4', 'A4'], arp: ['A4', 'C#5', 'E5', 'A5'] },
] as const;

/**
 * The tune: a beat per entry, three to a bar, over two turns of the
 * progression. It climbs to the top of the third bar and falls back, and the
 * last bar holds, so the waltz breathes before it starts again.
 */
const TUNE: ReadonlyArray<string | null> = [
  'A5', 'F#5', 'D5',
  'B5', 'F#5', 'D5',
  'G5', 'B5', 'D6',
  'C#6', 'B5', 'A5',
  'A5', 'F#5', 'A5',
  'D6', 'C#6', 'B5',
  'B5', 'G5', 'E5',
  'A5', null, null,
];

/** The sections, in the order the Constellation beatmap's phases run. */
const DUSK = 0;
const RISE = 1;
const SUPERNOVA = 2;

/** Eighths in a bar of the waltz. */
const BAR = 6;
/** Eighths in the build-up, and the silence it ends on before the drop. */
const RISE_LENGTH = 48;
const RISE_GAP = 4;
/** When the build-up's swell starts, so it peaks on that silence. */
const SWELL_AT = 31;

/**
 * Written for the Constellation beatmap: a waltz for a small orchestra in an
 * observatory among the stars, played from recorded instruments.
 *
 *   Dusk       a harp on the one, a celesta turning the chord over like a
 *              music box; the tune comes in on the fifth bar.
 *   Rise       the pizzicato's two beats join, a cello holds the bass, and a
 *              glockenspiel runs eighths in the last bars while timpani beat
 *              the one and a swell builds -- then two beats of nothing.
 *   Supernova  a harp glissando, timpani and triangle on the downbeat; the
 *              tune on celesta and glockenspiel, a soprano holding the top of
 *              each bar, harp runs under it all.
 *   Afterglow  the harp alone, slowly, and the tune half as often.
 */
function playConstellation(band: Band, { time, section, sinceSection }: Position): void {
  const deck = band.deck;
  if (!deck) return;
  const step = sinceSection % BAR;
  const bar = Math.floor(sinceSection / BAR);
  const chord = CHORDS[bar % CHORDS.length] ?? CHORDS[0];
  const tune = step % 2 === 0 ? (TUNE[Math.floor(sinceSection / 2) % TUNE.length] ?? null) : null;
  const sampler = (name: string): Tone.Sampler | null => deck.instrument(name, TUNED[name] ?? 'C4');
  const harp = sampler('harp');
  const celesta = sampler('celesta');
  const glock = sampler('glock');
  const pizz = sampler('pizz');
  const hold = (name: string, note: string, volume: number): void =>
    deck.playNote(name, TUNED[name] ?? 'C4', note, time, { volume });

  if (section === DUSK) {
    if (step === 0) harp?.triggerAttackRelease(chord.bass, '2n', time, 0.8);
    if (step === 2 || step === 4) celesta?.triggerAttackRelease(chord.arp[step / 2] ?? 'D5', '4n', time, 0.5);
    if (bar >= 4 && tune) celesta?.triggerAttackRelease(tune, '4n', time, 0.7);
    if (step === 0 && bar % 2 === 0) hold('choir', chord.chord[2] ?? 'D5', -14);
    return;
  }

  if (section === RISE) {
    if (sinceSection >= RISE_LENGTH - RISE_GAP) return;
    if (sinceSection === SWELL_AT) deck.play('swell', time, { volume: -4 });
    if (step === 0) {
      harp?.triggerAttackRelease(chord.bass, '2n', time);
      hold('strings', chord.bass, -8);
      if (bar >= 4) deck.play('timpani', time, { volume: -6 });
    }
    if (step === 2 || step === 4) pizz?.triggerAttackRelease([...chord.chord], '8n', time, 0.7);
    if (tune) celesta?.triggerAttackRelease(tune, '4n', time, 0.8);
    if (bar >= 5) glock?.triggerAttackRelease(chord.arp[sinceSection % 4] ?? 'D6', '16n', time, 0.4);
    return;
  }

  if (section === SUPERNOVA) {
    if (sinceSection === 0) {
      deck.play('glissando', time, { volume: -2 });
      deck.play('triangle', time, { volume: -6 });
    }
    if (step === 0) {
      deck.play('timpani', time, { volume: -3 });
      harp?.triggerAttackRelease(chord.bass, '2n', time);
      hold('strings', chord.bass, -6);
      hold('choir', chord.chord[2] ?? 'D5', -8);
      if (bar % 2 === 0) deck.play('triangle', time, { volume: -12 });
    }
    if (step === 2 || step === 4) pizz?.triggerAttackRelease([...chord.chord], '8n', time, 0.8);
    harp?.triggerAttackRelease(chord.arp[sinceSection % 4] ?? 'D5', '8n', time, 0.35);
    if (tune) {
      celesta?.triggerAttackRelease(tune, '4n', time, 0.9);
      glock?.triggerAttackRelease(octave(tune, 1), '8n', time, 0.45);
    }
    return;
  }

  // Afterglow, and anything past it.
  if (step === 0) harp?.triggerAttackRelease(chord.bass, '1n', time, 0.7);
  if (step % 2 === 0) harp?.triggerAttackRelease(chord.arp[(sinceSection / 2) % 4] ?? 'D5', '2n', time, 0.4);
  if (tune && Math.floor(sinceSection / 2) % 2 === 0) celesta?.triggerAttackRelease(tune, '2n', time, 0.6);
  if (step === 0 && bar % 2 === 0) hold('choir', chord.chord[1] ?? 'A4', -14);
}

export const soundtracks: Record<SoundtrackId, Soundtrack> = {
  groove: {
    play: playGroove,
    hitScale: ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'],
    levels: { music: 0, effects: 0 },
  },
  /* D major pentatonic, high on the glockenspiel: every hit is a note the
     waltz could have played, climbing with the combo. */
  constellation: {
    play: playConstellation,
    samples: soundSet('constellation'),
    hitInstrument: { name: 'glock', root: TUNED.glock ?? 'A6' },
    hitScale: ['D6', 'E6', 'F#6', 'A6', 'B6', 'D7', 'E7', 'F#7'],
    levels: { music: 3, effects: -4 },
    sliderStart: 'shooting',
    freeze: {
      begin: 'freeze',
      chord: [
        { name: 'strings', root: TUNED.strings ?? 'C3', note: 'D3' },
        { name: 'choir', root: TUNED.choir ?? 'C5', note: 'A4' },
        { name: 'choir', root: TUNED.choir ?? 'C5', note: 'F#5' },
      ],
      end: 'release',
    },
  },
};
