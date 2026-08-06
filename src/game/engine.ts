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
import { pointAt, prepareSliderPath, sliderProgress } from './slider';

/** A cursor reported by the render loop, in CSS pixels. */
export interface CursorInput {
  position: Vec2;
  pinching: boolean;
}

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
  private autoPaused = false;
  /** Seconds the hand has been missing, for the auto-pause. */
  private handLostFor = 0;
  private phaseIndex = 0;
  private phaseEventId = 0;
  /** Phases shifted by the countdown, ready to compare against `time`. */
  private phases: BeatmapPhase[] = [];
  /** Index, in the beatmap's own phase list, that this run started from. */
  private startPhase = 0;

  private t0 = 0;
  private clock: () => number = () => performance.now() / 1000;
  private onHitSound: ((grade: Exclude<Grade, 'MISS'>, combo: number) => void) | null = null;
  private onMissSound: ((brokeCombo: boolean) => void) | null = null;
  private onSliderTick: (() => void) | null = null;
  private onPhaseChange: ((index: number, phase: BeatmapPhase | undefined) => void) | null = null;
  private onFinish: (() => void) | null = null;
  private onPause: (() => void) | null = null;
  private onResume: ((atTime: number) => void) | null = null;

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
      autoPaused: this.autoPaused,
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
    onSliderTick: () => void;
    onPhaseChange: (index: number, phase: BeatmapPhase | undefined) => void;
    onFinish: () => void;
    onPause?: () => void;
    /** @param atTime the game time the run resumes at, rewind included. */
    onResume?: (atTime: number) => void;
  }): void {
    this.clock = options.clock;
    this.onHitSound = options.onHitSound;
    this.onMissSound = options.onMissSound;
    this.onSliderTick = options.onSliderTick;
    this.onPhaseChange = options.onPhaseChange;
    this.onFinish = options.onFinish;
    this.onPause = options.onPause ?? null;
    this.onResume = options.onResume ?? null;
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
   * @param fromPhase index of the phase to start at. Everything before it is
   *                dropped and the rest slides back to zero, so starting at
   *                Hard is a real run at Hard rather than a fast-forward: the
   *                countdown, the music and the notes all still line up.
   */
  start(beatmap: Beatmap, startAt?: number, fromPhase = 0): void {
    this.beatmap = beatmap;

    const sorted = [...beatmap.phases].sort((a, b) => a.start - b.start);
    const index = Math.max(0, Math.min(fromPhase, sorted.length - 1));
    // Seconds cut from the front of the map.
    const skip = sorted[index]?.start ?? 0;
    this.startPhase = index;

    // Phases are shifted by the countdown, exactly like the notes.
    this.phases = sorted
      .slice(index)
      .map((phase) => ({ ...phase, start: phase.start - skip + settings.COUNTDOWN }));

    this.targets = beatmap.notes
      .filter((note) => note.t >= skip)
      .map((note, i) => {
      const t = note.t - skip + settings.COUNTDOWN;
      const phaseIndex = this.phaseIndexAt(t);
      const phase = this.phases[phaseIndex];
      const windowScale = phase?.hitWindowScale ?? 1;
      const kind = note.kind ?? 'circle';
      // Head first, then the rest of the polyline.
      const path = prepareSliderPath([{ x: note.x, y: note.y }, ...(note.path ?? [])]);

      return {
        id: i,
        kind,
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

        points: path.points,
        cumulative: path.cumulative,
        pathLength: path.length,
        duration: kind === 'slider' ? (note.duration ?? 1) : 0,
        sliderState: 'pending' as const,
        heldTime: 0,
        lastTickAt: -1,
        broke: false,
      };
    });

    const last = this.targets.at(-1);
    this.duration = (last ? last.t + last.duration : 0) + 2;
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
    this.autoPaused = false;
    this.handLostFor = 0;
    this.phaseIndex = 0;
    this.phaseEventId += 1;
    this.t0 = startAt ?? this.clock();
    this.publish();
    this.onPhaseChange?.(this.startPhase, this.phases[0]);
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
      (target) =>
        !target.dead &&
        now >= target.t - target.approach &&
        now <= target.t + target.duration + target.goodWindow,
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
   * Freezes the run.
   *
   * Game time is `clock() - t0` against an audio clock that never stops, so
   * pausing is not a matter of stopping anything: `time` simply stops being
   * recomputed, and resuming rebases `t0` on whatever the clock says then.
   * Nothing drifts, because nothing was integrating.
   *
   * @param auto true when the hand was lost rather than the player asking.
   */
  pause(auto = false): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.autoPaused = auto;
    this.onPause?.();
    this.publish();
  }

  /**
   * Resumes, a beat or so before where it stopped.
   *
   * Dropping the player back exactly where they left off hands them a note
   * already halfway under its ring, which reads as the game cheating. Targets
   * already judged carry `dead`, so rewinding replays empty space rather than
   * re-judging anything.
   */
  resume(): void {
    if (this.phase !== 'paused') return;
    const at = Math.max(0, this.time - settings.RESUME_REWIND);
    this.time = at;
    this.t0 = this.clock() - at;
    this.autoPaused = false;
    this.handLostFor = 0;
    this.phase = 'playing';
    this.onResume?.(at);
    this.publish();
  }

  togglePause(): void {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  /**
   * Turns overdue targets into misses, ages the effects, publishes the snapshot.
   * @param dt render seconds elapsed (particles only).
   */
  update(dt: number): void {
    if (this.phase === 'paused') {
      // A run paused *for* the player resumes on its own when the reason goes
      // away. Making them find a key to undo something they never chose would
      // be a second interruption on top of the first.
      if (this.autoPaused && this.handVisible) this.resume();
      else if (this.snapshotDirty) this.publish();
      return;
    }

    if (this.phase !== 'playing') {
      this.effects.update(dt);
      if (this.snapshotDirty) this.publish();
      return;
    }

    // Auto-pause. Judged against render time rather than a frame count, so it
    // means the same thing on a 30 fps laptop as on a 144 Hz screen.
    if (this.handVisible) {
      this.handLostFor = 0;
    } else {
      this.handLostFor += dt;
      if (this.handLostFor > settings.AUTO_PAUSE_AFTER) {
        this.pause(true);
        return;
      }
    }

    // Phase change: banner plus a step up in musical intensity.
    const phaseIndex = this.phaseIndexAt(this.time);
    if (phaseIndex !== this.phaseIndex) {
      this.phaseIndex = phaseIndex;
      this.phaseEventId += 1;
      this.snapshotDirty = true;
      this.onPhaseChange?.(this.startPhase + phaseIndex, this.phases[phaseIndex]);
    }

    for (const target of this.targets) {
      if (target.dead) continue;

      // Head never hit: a miss, for a circle and for a slider alike.
      if (target.sliderState === 'pending' && this.time > target.t + target.goodWindow) {
        this.judge(target, 'MISS');
        continue;
      }

      // Slider that reached its end: judge the body on how much was followed.
      if (
        target.kind === 'slider' &&
        (target.sliderState === 'holding' || target.sliderState === 'dropped') &&
        this.time > target.t + target.duration
      ) {
        this.judgeSliderBody(target);
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
      // Only heads are hittable; a slider already grabbed is handled by tracking.
      if (target.sliderState !== 'pending') continue;
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
   * Per-frame slider tracking: keeps held sliders held.
   *
   * A slider stays "holding" while at least one cursor is BOTH pinching and
   * inside the follow circle around the moving ball. The follow circle is
   * deliberately larger than the head (SLIDER_FOLLOW_SCALE): grabbing is meant
   * to be precise, staying grabbed is not.
   *
   * Dropping does not end the slider — you can catch it again, exactly like
   * Osu!. It costs the combo once, and the time spent off the ball, which is
   * what the final grade is computed from.
   *
   * Call once per frame, after advanceClock() and before update().
   */
  trackSliders(cursors: readonly CursorInput[], playfield: Playfield, dt: number): void {
    if (this.phase !== 'playing') return;
    const now = this.time;

    for (const target of this.targets) {
      if (target.kind !== 'slider' || target.dead) continue;
      if (target.sliderState !== 'holding' && target.sliderState !== 'dropped') continue;
      if (now < target.t || now > target.t + target.duration) continue;

      const progress = sliderProgress(target, now);
      const ballPx = toScreen(playfield, pointAt(target, progress));
      const followRadius = radiusPx(playfield, target.radius) * settings.SLIDER_FOLLOW_SCALE;

      const following = cursors.some(
        (cursor) => cursor.pinching && pixelDistance(cursor.position, ballPx) <= followRadius,
      );

      if (following) {
        target.sliderState = 'holding';
        target.heldTime += dt;

        // Tick feedback while following: the slider should feel alive.
        if (now - target.lastTickAt >= settings.SLIDER_TICK_INTERVAL) {
          target.lastTickAt = now;
          this.onSliderTick?.();
          this.effects.sliderTick(pointAt(target, progress));
        }
      } else if (target.sliderState === 'holding') {
        // Just lost it: slider break.
        target.sliderState = 'dropped';
        if (!target.broke) {
          target.broke = true;
          this.combo = 0;
          this.onMissSound?.(true);
          this.snapshotDirty = true;
        }
      }
    }
  }

  /** Judges a slider body from the fraction of it that was actually followed. */
  private judgeSliderBody(target: Target): void {
    const ratio = target.duration > 0 ? target.heldTime / target.duration : 0;
    const grade: Grade =
      ratio >= settings.SLIDER_PERFECT_RATIO
        ? 'PERFECT'
        : ratio >= settings.SLIDER_GOOD_RATIO
          ? 'GOOD'
          : 'MISS';
    target.sliderState = 'done';
    // Judged at the tail, so the burst appears where the ball ended.
    this.judge(target, grade, pointAt(target, 1));
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

  /**
   * Records a judgement.
   *
   * A slider head keeps the target alive: the body is judged separately when the
   * ball reaches the end, so one slider yields two judgements, like Osu!.
   *
   * @param at where to spawn the effects (the tail, for a slider body).
   */
  private judge(target: Target, grade: Grade, at: Vec2 = target): void {
    const isSliderHead = target.kind === 'slider' && target.sliderState === 'pending';
    const startsSlider = isSliderHead && grade !== 'MISS';

    target.hit = grade !== 'MISS';
    target.grade = grade;
    // A grabbed slider stays on screen until its tail.
    target.dead = !startsSlider;
    if (startsSlider) {
      target.sliderState = 'holding';
      target.lastTickAt = this.time;
    } else if (target.kind === 'slider' && grade === 'MISS' && isSliderHead) {
      target.sliderState = 'done';
    }

    this.counts[grade] += 1;
    this.lastGrade = grade;
    this.lastGradeAt = this.time;
    this.lastOffsetMs = (this.time - target.t) * 1000;
    this.eventId += 1;

    if (grade === 'MISS') {
      // Like Osu!: a miss is audible, and louder when it breaks a streak.
      const brokeCombo = this.combo > 0;
      this.combo = 0;
      this.effects.miss(at, GRADE_STYLE.MISS.color);
      this.onMissSound?.(brokeCombo);
    } else {
      const style = GRADE_STYLE[grade];
      const multiplier = 1 + Math.min(this.combo, settings.COMBO_CAP) * settings.COMBO_BONUS;
      this.score += Math.round(style.score() * multiplier);
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.effects.burst(at, style.color, grade === 'PERFECT' ? 26 : 14);
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
