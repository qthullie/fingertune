/**
 * Audio (Tone.js) : sons de hit + metronome, et surtout l'HORLOGE de reference.
 *
 * Le timing du jeu s'appuie sur `Tone.now()` (horloge du contexte audio, bien plus
 * stable que performance.now() pour du rythme). Le rendu, lui, reste sur
 * requestAnimationFrame : les deux sont decouples, un frame drop ne decale pas la
 * musique.
 */

import * as Tone from 'tone';
import { settings } from '../config/settings';
import type { Grade } from '../game/types';

const COMBO_SCALE = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'] as const;

export class AudioEngine {
  private perfectSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private goodSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private metroSynth: Tone.MembraneSynth | null = null;
  private metroLoop: Tone.Loop | null = null;
  private initialized = false;

  get ready(): boolean {
    return this.initialized;
  }

  /** Doit etre appele DANS un geste utilisateur (clic), sinon l'audio reste suspendu. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();
    Tone.Destination.volume.value = settings.MASTER_VOLUME;

    const reverb = new Tone.Reverb({ decay: 1.4, wet: 0.18 }).toDestination();

    // Hit "Perfect" : ping brillant et court.
    this.perfectSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.12 },
    }).connect(reverb);
    this.perfectSynth.volume.value = -4;

    // Hit "Good" : plus sourd, plus discret.
    this.goodSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.11, sustain: 0, release: 0.08 },
    }).connect(reverb);
    this.goodSynth.volume.value = -8;

    // Metronome / piste rythmique minimale.
    this.metroSynth = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    }).toDestination();
    this.metroSynth.volume.value = -16;

    this.metroLoop = new Tone.Loop((time) => {
      if (settings.METRONOME_ON) this.metroSynth?.triggerAttackRelease('C2', '16n', time);
    }, '4n');

    this.initialized = true;
  }

  /** Horloge de reference du jeu, en secondes. */
  now(): number {
    return Tone.now();
  }

  setBpm(bpm: number): void {
    Tone.Transport.bpm.value = bpm;
  }

  startTransport(): void {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    this.metroLoop?.start(0);
    Tone.Transport.start();
  }

  stopTransport(): void {
    Tone.Transport.stop();
  }

  /** Son de hit. La note monte avec le combo pour recompenser les series. */
  playHit(grade: Exclude<Grade, 'MISS'>, combo: number): void {
    if (!this.initialized) return;
    const note = COMBO_SCALE[Math.min(combo, COMBO_SCALE.length - 1)] ?? 'C5';
    if (grade === 'PERFECT') this.perfectSynth?.triggerAttackRelease([note, 'G6'], '32n');
    else this.goodSynth?.triggerAttackRelease(note, '32n');
    // Miss : volontairement silencieux (feedback visuel discret uniquement).
  }

  dispose(): void {
    this.metroLoop?.dispose();
    this.perfectSynth?.dispose();
    this.goodSynth?.dispose();
    this.metroSynth?.dispose();
    this.initialized = false;
  }
}
