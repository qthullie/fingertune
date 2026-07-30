/**
 * Effets visuels : particules, anneau d'explosion, croix de miss, flash plein ecran.
 * Purement decoratif — aucune influence sur le score.
 */

import type { Vec2 } from './types';

export type EffectKind = 'particle' | 'ring' | 'miss' | 'ghost';

export interface Effect extends Vec2 {
  kind: EffectKind;
  vx: number;
  vy: number;
  /** 1 -> 0. L'effet meurt a 0. */
  life: number;
  decay: number;
  color: string;
  size: number;
}

export class EffectSystem {
  items: Effect[] = [];
  flashColor = '#ffffff';
  flashAmount = 0;

  /** Explosion de particules + anneau, au hit. */
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

  /** Croix rouge discrete sur un miss. */
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

  /** Pincement reconnu mais qui n'a touche aucune cible : anneau blanc discret. */
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

  /** @param dt secondes ecoulees depuis la frame precedente. */
  update(dt: number): void {
    for (const e of this.items) {
      e.life -= e.decay * dt;
      if (e.kind === 'particle') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += 0.55 * dt; // petite gravite
        e.vx *= 0.97;
        e.vy *= 0.97;
      }
    }
    if (this.items.some((e) => e.life <= 0)) {
      this.items = this.items.filter((e) => e.life > 0);
    }
    this.flashAmount = Math.max(0, this.flashAmount - dt * 2.2);
  }

  clear(): void {
    this.items = [];
    this.flashAmount = 0;
  }
}
