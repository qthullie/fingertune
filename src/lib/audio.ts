/**
 * Audio (Tone.js) : musique, sons de hit / miss, et surtout l'HORLOGE de reference.
 *
 * Le timing du jeu s'appuie sur `Tone.now()` (horloge du contexte audio, bien plus
 * stable que performance.now() pour du rythme). Le rendu, lui, reste sur
 * requestAnimationFrame : les deux sont decouples, un frame drop ne decale pas la
 * musique.
 *
 * La musique est GENEREE par Tone.js (aucun asset, aucun droit a gerer) et
 * arrangee par phase : phase 1 minimale, phase 2 basse + charleston, phase 3 tout
 * + lead. Elle demarre sur le meme instant audio que les cibles, donc les notes
 * de la beatmap tombent sur la grille du morceau, comme sur Osu!.
 *
 * Pour jouer sur ta propre musique : voir `music.ts` et VITE_MUSIC_URL.
 */

import * as Tone from 'tone';
import { settings } from '../config/settings';
import type { Grade } from '../game/types';

const COMBO_SCALE = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'] as const;

/** Grille du morceau genere : 2 mesures de 8 croches, en La mineur. */
const BASS_LINE = ['A1', 'A1', 'E2', 'A1', 'F1', 'F1', 'C2', 'G1'] as const;
const LEAD_LINE = ['A4', 'C5', 'E5', 'C5', 'F4', 'A4', 'C5', 'G4'] as const;
const PAD_CHORDS = [
  ['A3', 'C4', 'E4'],
  ['F3', 'A3', 'C4'],
] as const;

export class AudioEngine {
  private perfectSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private goodSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private missSynth: Tone.NoiseSynth | null = null;
  private missTone: Tone.Synth | null = null;
  private metroSynth: Tone.MembraneSynth | null = null;
  private reverbSend: Tone.Reverb | null = null;
  private reverbBus: Tone.Gain | null = null;

  /* Instruments du morceau. */
  private kick: Tone.MembraneSynth | null = null;
  private snare: Tone.NoiseSynth | null = null;
  private hat: Tone.NoiseSynth | null = null;
  private bass: Tone.MonoSynth | null = null;
  private lead: Tone.PolySynth<Tone.Synth> | null = null;
  private pad: Tone.PolySynth<Tone.Synth> | null = null;
  private musicPart: Tone.Loop | null = null;
  private metroLoop: Tone.Loop | null = null;
  private player: Tone.Player | null = null;

  /** Phase courante (0..2) : pilote l'arrangement. */
  private intensity = 0;
  /** Croche courante depuis le debut du morceau. */
  private step = 0;
  private initialized = false;

  get ready(): boolean {
    return this.initialized;
  }

  /** Doit etre appele DANS un geste utilisateur (clic), sinon l'audio reste suspendu. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();
    Tone.Destination.volume.value = settings.MASTER_VOLUME;

    /*
     * Bus d'effet en PARALLELE, jamais en serie.
     *
     * Tone.Reverb est un convolver dont l'impulse response est generee de facon
     * asynchrone : tant qu'elle n'existe pas, tout ce qui passe UNIQUEMENT par
     * lui sort du silence. Les instruments vont donc en direct vers la sortie,
     * et n'envoient qu'une copie dans la reverb (wet = 1, dose par son volume).
     */
    // Le gain dose la quantite de reverb dans le mix (Reverb n'a pas de volume).
    const reverbBus = new Tone.Gain(0.25).toDestination();
    const reverb = new Tone.Reverb({ decay: 1.4, wet: 1 }).connect(reverbBus);
    // On attend l'IR : sans ca, les premieres secondes de jeu sont sans queue.
    await reverb.generate();
    this.reverbSend = reverb;
    this.reverbBus = reverbBus;

    /* ---- Retours de jeu -------------------------------------------------- */

    // Hit "Perfect" : ping brillant et court.
    this.perfectSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.12 },
    }).toDestination();
    this.perfectSynth.connect(reverb);
    this.perfectSynth.volume.value = -2;

    // Hit "Good" : plus sourd, plus discret.
    this.goodSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.11, sustain: 0, release: 0.08 },
    }).toDestination();
    this.goodSynth.connect(reverb);
    this.goodSynth.volume.value = -6;

    // Miss : souffle sec + chute de hauteur. Volontairement desagreable.
    this.missSynth = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.002, decay: 0.22, sustain: 0 },
    })
      .connect(new Tone.Filter({ frequency: 1200, type: 'lowpass' }).toDestination());
    this.missSynth.volume.value = -12;

    this.missTone = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.004, decay: 0.28, sustain: 0, release: 0.1 },
    }).toDestination();
    this.missTone.volume.value = -20;

    // Metronome / count-in.
    this.metroSynth = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    }).toDestination();
    this.metroSynth.volume.value = -16;

    this.metroLoop = new Tone.Loop((time) => {
      if (settings.METRONOME_ON) this.metroSynth?.triggerAttackRelease('C2', '16n', time);
    }, '4n');

    /* ---- Morceau --------------------------------------------------------- */
    this.buildMusic(reverb);

    this.initialized = true;
  }

  /** Bip de verification : confirme a l'oreille que la sortie audio fonctionne. */
  playTestBlip(): void {
    this.metroSynth?.triggerAttackRelease('C4', '16n');
  }

  /** Construit les instruments du morceau et la boucle de sequencage. */
  private buildMusic(reverb: Tone.Reverb): void {
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.32, sustain: 0 },
    }).toDestination();
    this.kick.volume.value = -6;

    this.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    }).toDestination();
    this.snare.volume.value = -18;

    this.hat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
    }).connect(new Tone.Filter({ frequency: 7000, type: 'highpass' }).toDestination());
    this.hat.volume.value = -26;

    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      filter: { Q: 2, type: 'lowpass' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.25, release: 0.2 },
      filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.3, baseFrequency: 120, octaves: 2.5 },
    }).toDestination();
    this.bass.volume.value = -14;

    // Comme les sons de jeu : sortie directe + copie dans la reverb.
    this.lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.05, release: 0.2 },
    }).toDestination();
    this.lead.connect(reverb);
    this.lead.volume.value = -18;

    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.6, decay: 0.4, sustain: 0.5, release: 1.2 },
    }).toDestination();
    this.pad.connect(reverb);
    this.pad.volume.value = -22;

    // Une croche a la fois : l'arrangement lit `this.intensity` pour savoir quels
    // instruments jouent. Changer de phase change donc le morceau sans le couper.
    this.musicPart = new Tone.Loop((time) => {
      const step = this.step % 8;
      const bar = Math.floor(this.step / 8) % 2;
      this.step += 1;
      if (this.player) return; // musique perso : pas de piste generee par dessus

      // Nappe : toutes les 2 mesures, presente des la phase 1.
      if (step === 0) {
        const chord = PAD_CHORDS[bar] ?? PAD_CHORDS[0];
        this.pad?.triggerAttackRelease([...chord], '2n', time);
      }

      // Batterie : kick sur les temps, caisse claire sur 2 et 4 des la phase 2.
      if (step % 4 === 0) this.kick?.triggerAttackRelease('C1', '8n', time);
      if (this.intensity >= 1 && step === 4) this.snare?.triggerAttackRelease('16n', time);
      if (this.intensity >= 1 && step % 2 === 1) this.hat?.triggerAttackRelease('64n', time);

      // Basse : phase 2 et plus.
      if (this.intensity >= 1) {
        const note = BASS_LINE[step] ?? 'A1';
        this.bass?.triggerAttackRelease(note, '8n', time);
      }

      // Lead : phase 3 uniquement, et double croche sur la derniere mesure.
      if (this.intensity >= 2) {
        const note = LEAD_LINE[step] ?? 'A4';
        this.lead?.triggerAttackRelease(note, '16n', time);
        if (bar === 1 && step % 2 === 0) {
          this.lead?.triggerAttackRelease(note, '32n', time + Tone.Time('16n').toSeconds());
        }
      }
    }, '8n');
  }

  /** Horloge de reference du jeu, en secondes. */
  now(): number {
    return Tone.now();
  }

  setBpm(bpm: number): void {
    Tone.Transport.bpm.value = bpm;
  }

  /**
   * Charge une musique personnelle (VITE_MUSIC_URL). Si l'URL est absente ou le
   * fichier introuvable, on garde la piste generee.
   */
  async loadTrack(url: string | undefined): Promise<void> {
    if (!url) return;
    try {
      const player = new Tone.Player({ url, loop: false }).toDestination();
      await Tone.loaded();
      player.volume.value = settings.MUSIC_VOLUME;
      this.player = player;
    } catch (err) {
      console.warn('[fingertune] musique perso introuvable, piste generee utilisee :', err);
      this.player = null;
    }
  }

  /**
   * Demarre la musique et rend l'instant audio exact du t=0 de la partie, pour
   * que le moteur cale ses cibles dessus.
   *
   * @param delay marge (s) avant le depart, le temps de programmer les evenements.
   */
  startMusic(delay = 0.15): number {
    const startAt = Tone.now() + delay;
    this.step = 0;
    this.intensity = 0;

    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;
    // stop() avant start() : sur un relance (touche R) les Loops sont deja en
    // etat "started" et un start() seul ne les reprogrammerait pas apres cancel().
    this.musicPart?.stop(0);
    this.metroLoop?.stop(0);
    this.musicPart?.start(0);
    this.metroLoop?.start(0);

    // La musique attaque a la fin du decompte : pendant le decompte, count-in.
    if (this.player) {
      this.player.stop();
      this.player.start(startAt + settings.COUNTDOWN);
    } else {
      Tone.Transport.start(startAt + settings.COUNTDOWN);
    }

    // Count-in : un clic par seconde pendant le decompte.
    for (let i = 0; i < Math.floor(settings.COUNTDOWN); i++) {
      this.metroSynth?.triggerAttackRelease('C3', '32n', startAt + i);
    }

    return startAt;
  }

  stopMusic(): void {
    Tone.Transport.stop();
    this.player?.stop();
  }

  /** Monte l'arrangement d'un cran (appele au changement de phase). */
  setIntensity(level: number): void {
    this.intensity = Math.max(0, Math.min(2, level));
  }

  /** Son de hit. La note monte avec le combo pour recompenser les series. */
  playHit(grade: Exclude<Grade, 'MISS'>, combo: number): void {
    if (!this.initialized) return;
    const note = COMBO_SCALE[Math.min(combo, COMBO_SCALE.length - 1)] ?? 'C5';
    if (grade === 'PERFECT') this.perfectSynth?.triggerAttackRelease([note, 'G6'], '32n');
    else this.goodSynth?.triggerAttackRelease(note, '32n');
  }

  /** Son de rate. Plus appuye quand il casse un combo. */
  playMiss(brokeCombo: boolean): void {
    if (!this.initialized) return;
    const time = Tone.now();
    this.missSynth?.triggerAttackRelease('8n', time);
    if (brokeCombo && this.missTone) {
      // Chute de hauteur facon "combo break".
      this.missTone.triggerAttackRelease('A3', '8n', time);
      this.missTone.frequency.rampTo('D3', 0.22, time);
    }
  }

  dispose(): void {
    this.musicPart?.dispose();
    this.metroLoop?.dispose();
    for (const node of [
      this.perfectSynth,
      this.goodSynth,
      this.missSynth,
      this.missTone,
      this.metroSynth,
      this.reverbSend,
      this.reverbBus,
      this.kick,
      this.snare,
      this.hat,
      this.bass,
      this.lead,
      this.pad,
      this.player,
    ]) {
      node?.dispose();
    }
    this.initialized = false;
  }
}
