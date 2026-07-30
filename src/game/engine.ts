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
import type { Beatmap, GamePhase, GameSnapshot, Grade, Target, Vec2 } from './types';
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

  private t0 = 0;
  private clock: () => number = () => performance.now() / 1000;
  private onHitSound: ((grade: Exclude<Grade, 'MISS'>, combo: number) => void) | null = null;
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
    return {
      phase: this.phase,
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

  /** Branche l'horloge audio et les callbacks son / fin de partie. */
  configure(options: {
    clock: () => number;
    onHitSound: (grade: Exclude<Grade, 'MISS'>, combo: number) => void;
    onFinish: () => void;
  }): void {
    this.clock = options.clock;
    this.onHitSound = options.onHitSound;
    this.onFinish = options.onFinish;
  }

  setHandVisible(visible: boolean): void {
    if (visible !== this.handVisible) {
      this.handVisible = visible;
      this.snapshotDirty = true;
    }
  }

  /* --------------------------------------------------------------------- cycle */

  /** Charge une beatmap et demarre une partie. */
  start(beatmap: Beatmap): void {
    this.beatmap = beatmap;
    this.targets = beatmap.notes.map((note, i) => ({
      id: i,
      x: note.x,
      y: note.y,
      // Toute la map est decalee apres le decompte.
      t: note.t + settings.COUNTDOWN,
      hit: false,
      dead: false,
      grade: null,
    }));
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
    this.t0 = this.clock();
    this.publish();
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

  /** Cibles actuellement affichees / jugeables. */
  activeTargets(): Target[] {
    const now = this.time;
    return this.targets.filter(
      (o) =>
        !o.dead &&
        now >= o.t - settings.APPROACH_TIME &&
        now <= o.t + settings.WINDOW_GOOD,
    );
  }

  /**
   * Avance l'horloge, transforme en Miss les cibles depassees, fait vieillir les effets.
   * @param dt secondes de rendu ecoulees (pour les particules uniquement).
   */
  update(dt: number): void {
    if (this.phase !== 'playing') {
      this.effects.update(dt);
      if (this.snapshotDirty) this.publish();
      return;
    }

    this.time = this.clock() - this.t0;

    for (const target of this.targets) {
      if (!target.dead && this.time > target.t + settings.WINDOW_GOOD) {
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

    const hitRadius = settings.TARGET_RADIUS * settings.HIT_RADIUS_SCALE * view.minSide;
    let best: Target | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const target of this.activeTargets()) {
      if (screenDistance(view, pos, target) > hitRadius) continue;
      const delta = Math.abs(this.time - target.t);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = target;
      }
    }
    if (!best) return false;

    const grade: Grade | null =
      bestDelta <= settings.WINDOW_PERFECT
        ? 'PERFECT'
        : bestDelta <= settings.WINDOW_GOOD
          ? 'GOOD'
          : null;
    // Hors fenetre : pincement ignore, aucune penalite (comme un clic dans le vide).
    if (!grade) return false;

    this.judge(best, grade);
    return true;
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
      this.combo = 0;
      this.effects.miss(target, GRADE_STYLE.MISS.color);
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
