/**
 * One-Euro filter — responsive smoothing for the landmarks, and the velocity
 * estimate the predictor rides on.
 *
 * A low-pass whose cutoff frequency rises with the speed of the signal. Hand
 * still => very smooth (no jitter). Hand fast => little lag. Without it the
 * tracking shivers and hits land at random.
 *
 * Casiez, Roussel & Vogel, "1e Filter" (CHI 2012).
 */

import type { Vec2 } from '../game/types';

class LowPass {
  private y: number | null = null;

  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}

export class OneEuroFilter {
  private readonly xFilter = new LowPass();
  private readonly dxFilter = new LowPass();
  private lastValue = 0;
  private lastTime: number | null = null;
  private smoothedSpeed = 0;

  /**
   * The filtered rate of change, in units per second.
   *
   * This is not a new computation: the filter already needs a smoothed
   * derivative to decide its own cutoff, and that number is exactly the
   * velocity estimate a predictor wants. Exposing it costs nothing and avoids
   * a second, differently-smoothed estimate that would disagree with this one.
   */
  get speed(): number {
    return this.smoothedSpeed;
  }

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff: number,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param t clock in seconds (monotonic). */
  filter(x: number, t: number): number {
    if (this.lastTime === null) {
      this.lastTime = t;
      this.lastValue = x;
      return this.xFilter.filter(x, 1);
    }

    let dt = t - this.lastTime;
    if (!(dt > 0)) dt = 1 / 60; // guard: identical or backwards timestamps
    this.lastTime = t;

    const dx = (x - this.lastValue) / dt;
    const edx = this.dxFilter.filter(dx, OneEuroFilter.alpha(this.dCutoff, dt));
    this.smoothedSpeed = edx;
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const out = this.xFilter.filter(x, OneEuroFilter.alpha(cutoff, dt));
    this.lastValue = x;
    return out;
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
    this.lastValue = 0;
    this.smoothedSpeed = 0;
  }
}

/** A pair of One-Euro filters for a 2D point. */
export class Point2DFilter {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  /**
   * Smooths a point and, optionally, projects it forward in time.
   *
   * `lookahead` is dead reckoning against a latency that cannot be removed. The
   * webcam exposes a frame, transfers it, the model runs, and only then does the
   * game learn where the hand *was* — 40 to 80 ms ago on a typical laptop. The
   * cursor is therefore always behind the hand, and in a game judged to the
   * millisecond that shows up as every hit landing late.
   *
   * Projecting along the filtered velocity puts the cursor where the hand is
   * about to be instead of where it has been. Two guards make that safe:
   *
   * - The velocity comes from the filter's own smoothed derivative, so noise
   *   does not become a lurch.
   * - `maxStep` caps how far a single frame may extrapolate. Without it, the
   *   instant a hand reverses direction the prediction overshoots hard in the
   *   old direction, which is worse than the lag it was fixing.
   *
   * At `lookahead` 0 this is exactly the old behaviour.
   */
  filter(x: number, y: number, t: number, lookahead = 0, maxStep = Infinity): Vec2 {
    const sx = this.fx.filter(x, t);
    const sy = this.fy.filter(y, t);
    if (lookahead <= 0) return { x: sx, y: sy };

    let dx = this.fx.speed * lookahead;
    let dy = this.fy.speed * lookahead;
    const step = Math.hypot(dx, dy);
    if (step > maxStep) {
      const scale = maxStep / step;
      dx *= scale;
      dy *= scale;
    }
    return { x: sx + dx, y: sy + dy };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
