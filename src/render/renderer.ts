/**
 * Rendu canvas : video en miroir, cibles + cercles d'approche, effets, mains.
 *
 * Le HUD (score, combo, grade) est en DOM React par dessus le canvas : plus lisible,
 * plus facile a restyler, et ca evite de redessiner du texte a 60 fps.
 */

import { GRADE_STYLE, settings } from '../config/settings';
import type { GameEngine } from '../game/engine';
import type { HandState } from '../lib/handTracking';
import { radiusPx, toScreen, type View } from './view';

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  /** Dimensions en pixels CSS (le DPR est deja applique via setTransform). */
  width: number;
  height: number;
  view: View;
  video: HTMLVideoElement | null;
  engine: GameEngine;
  hands: readonly HandState[];
  fps: number;
}

export function renderFrame(input: RenderInput): void {
  drawVideo(input);
  drawTargets(input);
  drawEffects(input);
  drawHands(input);
  if (settings.DEBUG) drawDebug(input);
}

/* ------------------------------------------------------------------ video ---- */

function drawVideo({ ctx, width, height, view, video }: RenderInput): void {
  ctx.save();
  if (video && video.videoWidth > 0) {
    // Miroir horizontal : sans ca, le jeu est injouable (la main part du mauvais cote).
    ctx.translate(view.dx + view.dw, view.dy);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, view.dw, view.dh);
  } else {
    ctx.fillStyle = '#0b0b16';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();

  // Voile sombre : les cibles ressortent nettement sur l'image webcam.
  ctx.fillStyle = 'rgba(6,6,14,0.45)';
  ctx.fillRect(0, 0, width, height);
}

/* ----------------------------------------------------------------- cibles ---- */

function drawTargets({ ctx, view, engine }: RenderInput): void {
  const now = engine.time;
  const rTarget = radiusPx(view, settings.TARGET_RADIUS);

  // Des plus tardives vers les plus proches : la note a jouer est dessinee au-dessus.
  const visible = engine.activeTargets().sort((a, b) => b.t - a.t);

  for (const target of visible) {
    const p = toScreen(view, target);
    const age = now - (target.t - settings.APPROACH_TIME); // 0 -> APPROACH_TIME
    const progress = Math.min(age / settings.APPROACH_TIME, 1.35);
    const alpha = Math.min(age / settings.FADE_IN, 1);
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Disque
    const gradient = ctx.createRadialGradient(p.x, p.y, rTarget * 0.15, p.x, p.y, rTarget);
    gradient.addColorStop(0, 'rgba(255,255,255,0.30)');
    gradient.addColorStop(1, 'rgba(120,120,255,0.06)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rTarget, 0, Math.PI * 2);
    ctx.fill();

    // Anneau : passe au blanc lumineux pendant la fenetre Perfect.
    const inPerfect = Math.abs(now - target.t) <= settings.WINDOW_PERFECT;
    ctx.lineWidth = inPerfect ? 6 : 4;
    ctx.strokeStyle = inPerfect ? '#ffffff' : '#8ea2ff';
    if (inPerfect) {
      ctx.shadowColor = GRADE_STYLE.PERFECT.color;
      ctx.shadowBlur = 22;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, rTarget, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cercle d'approche : atteint exactement le rayon de la cible a l'instant t.
    if (progress <= 1.05) {
      const k = Math.min(progress, 1);
      const rApproach = rTarget * (settings.APPROACH_START - (settings.APPROACH_START - 1) * k);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,255,255,${0.28 + 0.55 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rApproach, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ----------------------------------------------------------------- effets ---- */

function drawEffects({ ctx, width, height, view, engine }: RenderInput): void {
  const { effects } = engine;

  for (const e of effects.items) {
    const p = toScreen(view, e);
    ctx.save();
    ctx.globalAlpha = Math.max(0, e.life);
    if (e.kind === 'particle') {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, e.size * e.life, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'ring') {
      const r = radiusPx(view, settings.TARGET_RADIUS) * (1 + (1 - e.life) * 1.8);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4 * e.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const r = radiusPx(view, settings.TARGET_RADIUS) * 0.6;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x + r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (effects.flashAmount > 0.001) {
    ctx.save();
    ctx.globalAlpha = effects.flashAmount;
    ctx.fillStyle = effects.flashColor;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ mains ---- */

function drawHands({ ctx, view, hands }: RenderInput): void {
  for (const hand of hands) {
    if (!hand.visible || !hand.thumb || !hand.index || !hand.pinchPos) continue;
    const thumb = toScreen(view, hand.thumb);
    const index = toScreen(view, hand.index);
    const mid = toScreen(view, hand.pinchPos);

    ctx.save();
    ctx.lineCap = 'round';

    // Ligne pouce-index : s'epaissit et vire au vert quand le pincement est actif.
    ctx.lineWidth = hand.pinching ? 9 : 3;
    ctx.strokeStyle = hand.pinching ? '#4dffb0' : 'rgba(255,255,255,0.55)';
    if (hand.pinching) {
      ctx.shadowColor = '#4dffb0';
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.moveTo(thumb.x, thumb.y);
    ctx.lineTo(index.x, index.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Bouts des doigts.
    const tips: Array<[{ x: number; y: number }, string]> = [
      [thumb, '#ff5edb'],
      [index, '#4dd8ff'],
    ];
    for (const [pt, color] of tips) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, hand.pinching ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Curseur = point milieu.
    ctx.strokeStyle = hand.pinching ? '#4dffb0' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, hand.pinching ? 16 : 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ debug ---- */

function drawDebug({ ctx, engine, hands, fps }: RenderInput): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '500 13px monospace';
  ctx.fillStyle = '#8affc0';
  const lines = [
    `fps ${fps.toFixed(0)}   t ${engine.time.toFixed(2)}s`,
    ...hands.map(
      (h) =>
        `main${h.id} ${h.visible ? 'OK' : '--'} ratio ${h.ratio.toFixed(3)} ` +
        `${h.pinching ? '[PINCE]' : ''}`,
    ),
    `seuils on<${settings.PINCH_ON_RATIO} off>${settings.PINCH_OFF_RATIO}`,
    `cibles actives ${engine.activeTargets().length}  effets ${engine.effects.items.length}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 16, 16 + i * 16));
  ctx.restore();
}
