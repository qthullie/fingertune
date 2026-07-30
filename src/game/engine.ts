/**
 * Game engine: targets, timing windows, judgement, score and combo.
 *
 * The engine is a mutable object (it runs at 60 fps) that publishes an immutable
 * `GameSnapshot` to React through a minimal store compatible with
 * `useSyncExternalStore`. The snapshot is only republished when something
 * changes, and its time is quantised to 50 ms so the HUD does not rerender 60
 * times a second.
 */

import { GRADE_STYLE, settings } from '../config/settings';
import { EffectSystem } from './effects';
import type { Beatmap, BeatmapPhase, GamePhase, GameSnapshot, Grade, Target, Vec2 } from './types';
import { pixelDistance, radiusPx, toScreen, type Playfield } from '../render/view';

/** How coarsely time is republished in the snapshot (seconds). */
const TIME_QUANTUM = 0.05;

type Listener = () => void;

export class GameEngine {
  readonly effects = new EffectSystem();
  targets: Target[] = [];
  phase: GamePhase = 'idle';
  /** Current game time, in seconds (full precision, for rendering). */
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
  /** Phases shifted by the countdown, ready to compare against `time`. */
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

  /* ------------------------------------------------------------- React store */

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
    for (const listener of this.listeners) listener();
  }

  /* ------------------------------------------------------------------ wiring */

  /** Wires the audio clock and the sound / phase / finish callbacks. */
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

  /** Number of tracked hands, reported by the render loop. */
  setHandCount(count: number): void {
    if (count !== this.handCount) {
      this.handCount = count;
      this.handVisible = count > 0;
      this.snapshotDirty = true;
    }
  }

  /* ------------------------------------------------------------------- cycle */

  /**
   * Loads a beatmap and starts a run.
   *
   * @param startAt audio-clock instant to use as the run's t=0. Lets the music
   *                and the targets start on the very same audio sample.
   *                Defaults to now.
   */
  start(beatmap: Beatmap, startAt?: number): void {
    this.beatmap = beatmap;

    // Phases are shifted by the countdown, exactly like the notes.
    this.phases = beatmap.phases
      .map((phase) => ({ ...phase, start: phase.start + settings.COUNTDOWN }))
      .sort((a, b) => a.start - b.start);

    this.targets = beatmap.notes.map((note, i) => {
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
        // Speed, forgiveness and size: the three difficulty levers.
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

  /** Index of the phase active at game time `t` (countdown included). */
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

  /** Weighted accuracy, as a percentage. */
  get accuracy(): number {
    const judged = this.counts.PERFECT + this.counts.GOOD + this.counts.MISS;
    if (judged === 0) return 100;
    const got =
      this.counts.PERFECT * GRADE_STYLE.PERFECT.weight + this.counts.GOOD * GRADE_STYLE.GOOD.weight;
    return (got / judged) * 100;
  }

  /** Seconds since the last judgement (for canvas animations). */
  get sinceLastGrade(): number {
    return this.time - this.lastGradeAt;
  }

  get comboLive(): number {
    return this.combo;
  }

  get currentPhaseIndex(): number {
    return this.phaseIndex;
  }

  /** Targets currently displayed / judgeable (approach window is per phase). */
  activeTargets(): Target[] {
    const now = this.time;
    return this.targets.filter(
      (target) => !target.dead && now >= target.t - target.approach && now <= target.t + target.goodWindow,
    );
  }

  /**
   * Reads the audio clock. Call this FIRST in the frame, before detection and
   * input: otherwise a hit is judged with the previous frame's time, i.e. ~16 ms
   * of error against a Perfect window that is only 60 ms wide.
   */
  advanceClock(): void {
    if (this.phase === 'playing') this.time = this.clock() - this.t0;
  }

  /**
   * Turns overdue targets into misses, ages the effects, publishes the snapshot.
   * @param dt render seconds elapsed (particles only).
   */
  update(dt: number): void {
    if (this.phase !== 'playing') {
      this.effects.update(dt);
      if (this.snapshotDirty) this.publish();
      return;
    }

    // Phase change: banner plus a step up in musical intensity.
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

    // Republish on a judgement, or when the quantised time ticks over.
    const quantised = Math.round(this.time / TIME_QUANTUM) * TIME_QUANTUM;
    if (this.snapshotDirty || Math.abs(quantised - this.snapshotCache.time) > 1e-9) {
      this.publish();
    }
  }

  /**
   * Attempts a hit.
   *
   * @param cursorPx pinch position in CSS pixels (converted through the View,
   *                 since landmarks live in video space and targets do not).
   * @param playfield where targets are laid out.
   * @returns true if a target was consumed.
   */
  tryHit(cursorPx: Vec2, playfield: Playfield): boolean {
    if (this.phase !== 'playing') return false;

    let best: Target | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const target of this.activeTargets()) {
      // Hit radius follows the phase: easy targets are bigger.
      const hitRadius = radiusPx(playfield, target.radius) * settings.HIT_RADIUS_SCALE;
      if (pixelDistance(cursorPx, toScreen(playfield, target)) > hitRadius) continue;
      const delta = Math.abs(this.time - target.t);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = target;
      }
    }
    if (!best) return false;

    const grade: Grade | null =
      bestDelta <= best.perfectWindow ? 'PERFECT' : bestDelta <= best.goodWindow ? 'GOOD' : null;
    // Outside the windows: the pinch is ignored, with no penalty (like clicking
    // on empty space).
    if (!grade) return false;

    this.judge(best, grade);
    return true;
  }

  /**
   * A pinch was recognised but hit nothing. No penalty: just a marker, so you
   * can tell at a glance whether the gesture was recognised at all.
   */
  notePinchMiss(cursorPx: Vec2, playfield: Playfield): void {
    this.effects.pinchGhost({
      x: (cursorPx.x - playfield.x) / playfield.width,
      y: (cursorPx.y - playfield.y) / playfield.height,
    });
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
      // Like Osu!: a miss is audible, and louder when it breaks a streak.
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
