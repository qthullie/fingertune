/**
 * Transformation "cover" de la video dans le canvas.
 *
 * Landmarks ET cibles vivent dans le meme repere normalise 0..1 attache a l'image
 * video affichee : ce qui garantit qu'une cible dessinee a (x, y) est atteignable
 * par la main a (x, y), quel que soit l'aspect ratio de la fenetre.
 */

import type { Vec2 } from '../game/types';

export interface View {
  /** Offset en pixels CSS du coin haut-gauche de l'image affichee. */
  dx: number;
  dy: number;
  /** Taille en pixels CSS de l'image affichee (peut deborder du canvas). */
  dw: number;
  dh: number;
  /** min(dw, dh) : reference pour les rayons, garde les cercles circulaires. */
  minSide: number;
}

export function computeCoverView(
  canvasWidth: number,
  canvasHeight: number,
  videoWidth: number,
  videoHeight: number,
): View {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return {
      dx: 0,
      dy: 0,
      dw: canvasWidth,
      dh: canvasHeight,
      minSide: Math.min(canvasWidth, canvasHeight),
    };
  }
  const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
  const dw = videoWidth * scale;
  const dh = videoHeight * scale;
  return {
    dx: (canvasWidth - dw) / 2,
    dy: (canvasHeight - dh) / 2,
    dw,
    dh,
    minSide: Math.min(dw, dh),
  };
}

/** Normalise (0..1 zone video) -> pixels CSS du canvas. */
export function toScreen(view: View, p: Vec2): Vec2 {
  return { x: view.dx + p.x * view.dw, y: view.dy + p.y * view.dh };
}

/** Rayon normalise -> pixels. */
export function radiusPx(view: View, rNorm: number): number {
  return rNorm * view.minSide;
}

/** Distance ecran (px) entre deux points normalises : evite l'ovalisation. */
export function screenDistance(view: View, a: Vec2, b: Vec2): number {
  return Math.hypot((a.x - b.x) * view.dw, (a.y - b.y) * view.dh);
}
