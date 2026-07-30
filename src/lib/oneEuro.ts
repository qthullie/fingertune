/**
 * Filtre One-Euro — lissage reactif des landmarks.
 *
 * Principe : un passe-bas dont la frequence de coupure augmente avec la vitesse du
 * signal. Main immobile => tres lisse (zero tremblement). Main rapide => peu de lag.
 * Sans ce filtre, le tracking tremblote et les hits partent au hasard.
 *
 * Casiez, Roussel & Vogel, "1e Filter" (CHI 2012).
 */

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

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff: number,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param t horloge en secondes (monotone). */
  filter(x: number, t: number): number {
    if (this.lastTime === null) {
      this.lastTime = t;
      this.lastValue = x;
      return this.xFilter.filter(x, 1);
    }

    let dt = t - this.lastTime;
    if (!(dt > 0)) dt = 1 / 60; // garde-fou : timestamps identiques ou en arriere
    this.lastTime = t;

    const dx = (x - this.lastValue) / dt;
    const edx = this.dxFilter.filter(dx, OneEuroFilter.alpha(this.dCutoff, dt));
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
  }
}

/** Paire de filtres One-Euro pour un point 2D. */
export class Point2DFilter {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(x: number, y: number, t: number): { x: number; y: number } {
    return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
