/**
 * Visual effects: particles, burst rings, miss crosses, full-screen flash.
 * Purely decorative — none of it touches the score.
 */

import type { Vec2 } from './types';

export type EffectKind = 'particle' | 'ring' | 'miss' | 'ghost';

export interface Effect extends Vec2 {
  kind: EffectKind;
  vx: number;
  vy: number;
  /** 1 -> 0. The effect dies at 0. */
  life: number;
  decay: number;
  color: string;
  size: number;
}

export class EffectSystem {
  items: Effect[] = [];
  flashColor = '#ffffff';
  flashAmount = 0;

  /** Particle burst plus a ring, on a hit. */
  burst(at: Vec2, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.1 + Math.random() * 0.42;
      this.items.push({
        kind: 'particle',
        x: at.x,
        y: at.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 1.6 + Math.random() * 1.4,
        color,
        size: 2 + Math.random() * 4,
      });
    }
    this.items.push({
      kind: 'ring',
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      life: 1,
      decay: 2.6,
      color,
      size: 1,
    });
  }

  /** Discreet red cross on a miss. */
  miss(at: Vec2, color: string): void {
    this.items.push({
      kind: 'miss',
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      life: 1,
      decay: 1.6,
      color,
      size: 1,
    });
  }

  /** Pinch recognised but nothing hit: a small white ring. */
  pinchGhost(at: Vec2): void {
    this.items.push({
      kind: 'ghost',
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      life: 1,
      decay: 3.2,
      color: 'rgba(255,255,255,0.9)',
      size: 1,
    });
  }

  flash(color: string, amount: number): void {
    this.flashColor = color;
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  /** @param dt seconds elapsed since the previous frame. */
  update(dt: number): void {
    for (const effect of this.items) {
      effect.life -= effect.decay * dt;
      if (effect.kind === 'particle') {
        effect.x += effect.vx * dt;
        effect.y += effect.vy * dt;
        effect.vy += 0.55 * dt; // a little gravity
        effect.vx *= 0.97;
        effect.vy *= 0.97;
      }
    }
    if (this.items.some((effect) => effect.life <= 0)) {
      this.items = this.items.filter((effect) => effect.life > 0);
    }
    this.flashAmount = Math.max(0, this.flashAmount - dt * 2.2);
  }

  clear(): void {
    this.items = [];
    this.flashAmount = 0;
  }
}
