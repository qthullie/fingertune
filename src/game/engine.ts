/**
 * Moteur de jeu : cibles, fenetres de timing, jugement, score/combo.
 *
 * Le moteur est un objet mutable (perf : il tourne a 60 fps) qui publie un
 * `GameSnapshot` immuable pour React via un store minimal compatible
 * `useSyncExternalStore`. Le snapshot n'est republie que quand quelque chose change,
 * et le temps y est arrondi a 50 ms pour ne pas re-rendre le HUD 60 fois par seconde.
 */

import { GRADE_STYLE, settings } from '../config/settings';
import { EffectSystem } from './effects';
import type { Beatmap, BeatmapPhase, GamePhase, GameSnapshot, Grade, Target, Vec2 } from './types';
import { screenDistance } from '../render/view';
import type { View } from '../render/view';

/** Granularite de republication du temps dans le snapshot (secondes). */
const TIME_QUANTUM = 0.05;

type Listener = () => void;

export class GameEngine {
  readonly effects = new EffectSystem();
  targets: Target[] = [];
  phase: GamePhase = 'idle';
  /** Temps de jeu courant, en secondes (haute precision, pour le rendu). */
  time = 0;
  duration = 0;

  private beatmap: Beatmap | null = null;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private counts: Record<Grade, number> = { PERFECT: 0, GOOD: 0, MISS: 0 };
  private lastGrade: Grade | null = null;
  private lastGradeAt = -10;
  private lastOffsetMs = 0;
  private eventId = 0;
  private handVisible = false;
  private handCount = 0;
  private phaseIndex = 0;
  private phaseEventId = 0;
  /** Phases decalees du decompte, pretes a comparer a `time`. */
  private phases: BeatmapPhase[] = [];

  private t0 = 0;
  private clock: () => number = () => performance.now() / 1000;
  private onHitSound: ((grade: Exclude<Grade, 'MISS'>, combo: number) => void) | null = null;
  private onMissSound: ((brokeCombo: boolean) => void) | null = null;
  private onPhaseChange: ((index: number, phase: BeatmapPhase | undefined) => void) | null = null;
  private onFinish: (() => void) | null = null;

  private listeners = new Set<Listener>();
  private snapshotCache: GameSnapshot = this.buildSnapshot();
  private snapshotDirty = false;

  /* ---------------------------------------------------------------- store React */

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameSnapshot => this.snapshotCache;

  private buildSnapshot(): GameSnapshot {
    const current = this.phases[this.phaseIndex];
    return {
      phase: this.phase,
      phaseIndex: this.phaseIndex,
      phaseCount: this.phases.length,
      phaseName: current?.name ?? '',
      phaseHint: current?.hint ?? '',
      phaseEventId: this.phaseEventId,
      handCount: this.handCount,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      accuracy: this.accuracy,
      counts: { ...this.counts },
      lastGrade: this.lastGrade,
      lastEventId: this.eventId,
      lastOffsetMs: this.lastOffsetMs,
      time: Math.round(this.time / TIME_QUANTUM) * TIME_QUANTUM,
      duration: this.duration,
      handVisible: this.handVisible,
    };
  }

  private publish(): void {
    this.snapshotCache = this.buildSnapshot();
    this.snapshotDirty = false;
    for (const l of this.listeners) l();
  }

  /* ------------------------------------------------------------------- cablage */

  /** Branche l'horloge audio et les callbacks son / phase / fin de partie. */
  configure(options: {
    clock: () => number;
    onHitSound: (grade: Exclude<Grade, 'MISS'>, combo: number) => void;
    onMissSound: (brokeCombo: boolean) => void;
    onPhaseChange: (index: number, phase: BeatmapPhase | undefined) => void;
    onFinish: () => void;
  }): void {
    this.clock = options.clock;
    this.onHitSound = options.onHitSound;
    this.onMissSound = options.onMissSound;
    this.onPhaseChange = options.onPhaseChange;
    this.onFinish = options.onFinish;
  }

  /** Nombre de mains suivies, remonte par la boucle de rendu. */
  setHandCount(count: number): void {
    if (count !== this.handCount) {
      this.handCount = count;
      this.handVisible = count > 0;
      this.snapshotDirty = true;
    }
  }

  /* --------------------------------------------------------------------- cycle */

  /**
   * Charge une beatmap et demarre une partie.
   *
   * @param startAt instant (horloge audio) du t=0 de la partie. Permet de caler
   *                le depart de la musique et celui des cibles sur le meme
   *                echantillon audio. Par defaut : maintenant.
   */
  start(beatmap: Beatmap, startAt?: number): void {
    this.beatmap = beatmap;

    // Les phases sont decalees du decompte, comme les notes.
    this.phases = beatmap.phases
      .map((p) => ({ ...p, start: p.start + settings.COUNTDOWN }))
      .sort((a, b) => a.start - b.start);

    this.targets = beatmap.notes.map((note, i) => {
      // Toute la map est decalee apres le decompte.
      const t = note.t + settings.COUNTDOWN;
      const phaseIndex = this.phaseIndexAt(t);
      const phase = this.phases[phaseIndex];
      const windowScale = phase?.hitWindowScale ?? 1;
      return {
        id: i,
        x: note.x,
        y: note.y,
        t,
        hit: false,
        dead: false,
        grade: null,
        // Vitesse, indulgence et taille : les trois leviers de difficulte.
        approach: phase?.approachTime ?? settings.APPROACH_TIME,
        perfectWindow: settings.WINDOW_PERFECT * windowScale,
        goodWindow: settings.WINDOW_GOOD * windowScale,
        radius: settings.TARGET_RADIUS * (phase?.targetScale ?? 1),
        phaseIndex,
      };
    });
    this.duration = (this.targets.at(-1)?.t ?? 0) + 2;
    this.effects.clear();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { PERFECT: 0, GOOD: 0, MISS: 0 };
    this.lastGrade = null;
    this.lastGradeAt = -10;
    this.lastOffsetMs = 0;
    this.time = 0;
    this.phase = 'playing';
    this.phaseIndex = 0;
    this.phaseEventId += 1;
    this.t0 = startAt ?? this.clock();
    this.publish();
    this.onPhaseChange?.(0, this.phases[0]);
  }

  /** Index de la phase active a l'instant `t` (temps de jeu, decompte inclus). */
  private phaseIndexAt(t: number): number {
    let index = 0;
    for (let i = 0; i < this.phases.length; i++) {
      const phase = this.phases[i];
      if (phase && t >= phase.start) index = i;
    }
    return index;
  }

  get currentBeatmap(): Beatmap | null {
    return this.beatmap;
  }

  get judgedCount(): number {
    return this.counts.PERFECT + this.counts.GOOD + this.counts.MISS;
  }

  /** Precision ponderee, en pourcents. */
  get accuracy(): number {
    const judged = this.counts.PERFECT + this.counts.GOOD + this.counts.MISS;
    if (judged === 0) return 100;
    const got =
      this.counts.PERFECT * GRADE_STYLE.PERFECT.weight + this.counts.GOOD * GRADE_STYLE.GOOD.weight;
    return (got / judged) * 100;
  }

  /** Age du dernier jugement en secondes (pour les animations canvas). */
  get sinceLastGrade(): number {
    return this.time - this.lastGradeAt;
  }

  get comboLive(): number {
    return this.combo;
  }

  get currentPhaseIndex(): number {
    return this.phaseIndex;
  }

  /** Cibles actuellement affichees / jugeables (fenetre d'approche propre a la phase). */
  activeTargets(): Target[] {
    const now = this.time;
    return this.targets.filter(
      (o) => !o.dead && now >= o.t - o.approach && now <= o.t + o.goodWindow,
    );
  }

  /**
   * Lit l'horloge audio. A appeler EN DEBUT de frame, avant la detection et les
   * entrees : sinon un hit est juge avec le temps de la frame precedente, soit
   * ~16 ms d'erreur sur une fenetre Perfect qui n'en fait que 60.
   */
  advanceClock(): void {
    if (this.phase === 'playing') this.time = this.clock() - this.t0;
  }

  /**
   * Transforme en Miss les cibles depassees, fait vieillir les effets, publie.
   * @param dt secondes de rendu ecoulees (pour les particules uniquement).
   */
  update(dt: number): void {
    if (this.phase !== 'playing') {
      this.effects.update(dt);
      if (this.snapshotDirty) this.publish();
      return;
    }

    // Changement de phase : banniere + montee d'intensite musicale.
    const phaseIndex = this.phaseIndexAt(this.time);
    if (phaseIndex !== this.phaseIndex) {
      this.phaseIndex = phaseIndex;
      this.phaseEventId += 1;
      this.snapshotDirty = true;
      this.onPhaseChange?.(phaseIndex, this.phases[phaseIndex]);
    }

    for (const target of this.targets) {
      if (!target.dead && this.time > target.t + target.goodWindow) {
        this.judge(target, 'MISS');
      }
    }
    this.effects.update(dt);

    if (this.time > this.duration) this.finish();

    // Republie si un jugement a eu lieu, ou si le temps a change de cran.
    const quantized = Math.round(this.time / TIME_QUANTUM) * TIME_QUANTUM;
    if (this.snapshotDirty || Math.abs(quantized - this.snapshotCache.time) > 1e-9) {
      this.publish();
    }
  }

  /**
   * Tente un hit a la position du pincement.
   * @returns true si une cible a ete consommee.
   */
  tryHit(pos: Vec2, view: View): boolean {
    if (this.phase !== 'playing') return false;

    let best: Target | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const target of this.activeTargets()) {
      // Le rayon de hit suit la phase : les cibles faciles sont plus grosses.
      const hitRadius = target.radius * settings.HIT_RADIUS_SCALE * view.minSide;
      if (screenDistance(view, pos, target) > hitRadius) continue;
      const delta = Math.abs(this.time - target.t);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = target;
      }
    }
    if (!best) return false;

    const grade: Grade | null =
      bestDelta <= best.perfectWindow ? 'PERFECT' : bestDelta <= best.goodWindow ? 'GOOD' : null;
    // Hors fenetre : pincement ignore, aucune penalite (comme un clic dans le vide).
    if (!grade) return false;

    this.judge(best, grade);
    return true;
  }

  /**
   * Pincement detecte mais qui n'a rien touche. Aucune penalite : juste un
   * marqueur visuel, pour voir d'un coup d'oeil si le geste a ete reconnu.
   */
  notePinchMiss(pos: Vec2): void {
    this.effects.pinchGhost(pos);
  }

  private judge(target: Target, grade: Grade): void {
    target.hit = grade !== 'MISS';
    target.dead = true;
    target.grade = grade;

    this.counts[grade] += 1;
    this.lastGrade = grade;
    this.lastGradeAt = this.time;
    this.lastOffsetMs = (this.time - target.t) * 1000;
    this.eventId += 1;

    if (grade === 'MISS') {
      // Comme sur Osu! : un rate s'entend. Le son est plus fort si un combo tombe.
      const brokeCombo = this.combo > 0;
      this.combo = 0;
      this.effects.miss(target, GRADE_STYLE.MISS.color);
      this.onMissSound?.(brokeCombo);
    } else {
      const style = GRADE_STYLE[grade];
      const multiplier = 1 + Math.min(this.combo, settings.COMBO_CAP) * settings.COMBO_BONUS;
      this.score += Math.round(style.score() * multiplier);
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.effects.burst(target, style.color, grade === 'PERFECT' ? 26 : 14);
      this.effects.flash(style.color, grade === 'PERFECT' ? 0.28 : 0.16);
      this.onHitSound?.(grade, this.combo);
    }
    this.snapshotDirty = true;
  }

  private finish(): void {
    this.phase = 'finished';
    this.publish();
    this.onFinish?.();
  }

  abort(): void {
    if (this.phase === 'playing') {
      this.phase = 'idle';
      this.publish();
    }
  }
}
