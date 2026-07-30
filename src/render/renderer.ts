/**
 * Canvas rendering: mirrored video, targets and approach rings, effects, hands.
 *
 * The HUD (score, combo, grade) is React DOM on top of the canvas: easier to
 * read, easier to restyle, and it avoids redrawing text at 60 fps.
 */

import { GRADE_STYLE, settings } from '../config/settings';
import type { GameEngine } from '../game/engine';
import { HAND_CONNECTIONS, LANDMARK_COUNT, type HandState } from '../lib/handTracking';
import { radiusPx, toScreen, type Playfield, type View } from './view';

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  /** Size in CSS pixels (the DPR is already applied via setTransform). */
  width: number;
  height: number;
  /** Where the webcam image is drawn. Landmarks map through this. */
  view: View;
  /** Visible area where targets live. Targets map through this. */
  playfield: Playfield;
  video: HTMLVideoElement | null;
  engine: GameEngine;
  hands: readonly HandState[];
  fps: number;
}

export function renderFrame(input: RenderInput): void {
  drawVideo(input);
  if (settings.SHOW_PLAYFIELD) drawPlayfield(input);
  drawTargets(input);
  drawEffects(input);
  drawHands(input);
  if (settings.SHOW_PINCH_METER) drawPinchMeter(input);
  if (settings.DEBUG) drawDebug(input);
}

/* ------------------------------------------------------------------ video ---- */

function drawVideo({ ctx, width, height, view, video }: RenderInput): void {
  ctx.save();
  if (video && video.videoWidth > 0) {
    // Mirrored: without this the game is unplayable, the hand moves the wrong way.
    ctx.translate(view.x + view.width, view.y);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, view.width, view.height);
  } else {
    ctx.fillStyle = '#0b0b16';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();

  // Dark veil so the targets read clearly over the webcam image.
  ctx.fillStyle = 'rgba(6,6,14,0.45)';
  ctx.fillRect(0, 0, width, height);
}

/** Debug outline of the area targets can occupy. */
function drawPlayfield({ ctx, playfield }: RenderInput): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(77,216,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(playfield.x, playfield.y, playfield.width, playfield.height);
  ctx.restore();
}

/* ---------------------------------------------------------------- targets ---- */

function drawTargets({ ctx, playfield, engine }: RenderInput): void {
  const now = engine.time;

  // Latest first, so the note to play is drawn on top.
  const visible = engine.activeTargets().sort((a, b) => b.t - a.t);

  for (const target of visible) {
    const p = toScreen(playfield, target);
    // Radius comes from the phase (easy targets are bigger).
    const rTarget = radiusPx(playfield, target.radius);
    const age = now - (target.t - target.approach); // 0 -> target.approach
    const progress = Math.min(age / target.approach, 1.35);
    const alpha = Math.min(age / settings.FADE_IN, 1);
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Disc
    const gradient = ctx.createRadialGradient(p.x, p.y, rTarget * 0.15, p.x, p.y, rTarget);
    gradient.addColorStop(0, 'rgba(255,255,255,0.30)');
    gradient.addColorStop(1, 'rgba(120,120,255,0.06)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rTarget, 0, Math.PI * 2);
    ctx.fill();

    // Ring: turns bright white during the Perfect window.
    const inPerfect = Math.abs(now - target.t) <= target.perfectWindow;
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

    // Approach ring: reaches the target radius exactly on the beat.
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

/* ---------------------------------------------------------------- effects ---- */

function drawEffects({ ctx, width, height, playfield, engine }: RenderInput): void {
  const { effects } = engine;

  for (const effect of effects.items) {
    const p = toScreen(playfield, effect);
    ctx.save();
    ctx.globalAlpha = Math.max(0, effect.life);
    if (effect.kind === 'particle') {
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, effect.size * effect.life, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === 'ghost') {
      // Pinch recognised, nothing hit: a small ring that tightens.
      const r = radiusPx(playfield, settings.TARGET_RADIUS) * (0.55 + effect.life * 0.35);
      ctx.globalAlpha = Math.max(0, effect.life) * 0.65;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.kind === 'ring') {
      const r = radiusPx(playfield, settings.TARGET_RADIUS) * (1 + (1 - effect.life) * 1.8);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 4 * effect.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const r = radiusPx(playfield, settings.TARGET_RADIUS) * 0.6;
      ctx.strokeStyle = effect.color;
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

/* ------------------------------------------------------------------ hands ---- */

/** Accent colour per hand: slot 0 cyan, slot 1 magenta. */
function handAccent(hand: HandState): string {
  return hand.id === 0 ? '#4dd8ff' : '#ff5edb';
}

/**
 * Full skeleton: 21 landmarks joined by HAND_CONNECTIONS.
 * Drawn in two passes (thick dark stroke, then a light one) so it stays legible
 * over any webcam background.
 */
function drawSkeleton(ctx: CanvasRenderingContext2D, view: View, hand: HandState): void {
  const points = hand.landmarks;
  if (points.length < LANDMARK_COUNT) return;

  const screen = points.map((p) => toScreen(view, p));
  const accent = handAccent(hand);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? 'rgba(6,6,14,0.55)' : accent;
    ctx.lineWidth = pass === 0 ? 6 : 2.5;
    ctx.globalAlpha = pass === 0 ? 1 : 0.85;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = screen[a];
      const pb = screen[b];
      if (!pa || !pb) continue;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();
  }

  // Joints. Fingertips are drawn a little larger.
  ctx.globalAlpha = 1;
  const tips = new Set([4, 8, 12, 16, 20]);
  for (let i = 0; i < screen.length; i++) {
    const p = screen[i];
    if (!p) continue;
    ctx.fillStyle = tips.has(i) ? accent : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, tips.has(i) ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHands({ ctx, view, hands }: RenderInput): void {
  for (const hand of hands) {
    if (!hand.visible || !hand.thumb || !hand.index || !hand.pinchPos) continue;

    // Skeleton first: it sits under the pinch markers.
    if (settings.SHOW_SKELETON) drawSkeleton(ctx, view, hand);

    const thumb = toScreen(view, hand.thumb);
    const index = toScreen(view, hand.index);
    const mid = toScreen(view, hand.pinchPos);

    ctx.save();
    ctx.lineCap = 'round';

    // Thumb-index line: thickens and turns green while the pinch is active.
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

    // Fingertips, in the hand's colour.
    for (const point of [thumb, index]) {
      ctx.fillStyle = handAccent(hand);
      ctx.beginPath();
      ctx.arc(point.x, point.y, hand.pinching ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Cursor = midpoint.
    ctx.strokeStyle = hand.pinching ? '#4dffb0' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, hand.pinching ? 16 : 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------ pinch meter ---- */

/**
 * Pinch gauge, one per tracked hand.
 *
 * Shows the live ratio and both hysteresis thresholds. This is the most direct
 * diagnosis available: if the bar never drops below the low threshold when you
 * pinch, the problem is detection (threshold, lighting, hand angle), not the game.
 */
function drawPinchMeter({ ctx, width, height, hands }: RenderInput): void {
  const visible = hands.filter((hand) => hand.visible);
  if (visible.length === 0) return;

  const barWidth = 132;
  const barHeight = 8;
  const x = width - barWidth - 24;
  let y = height - 34 - (visible.length - 1) * 30;

  for (const hand of visible) {
    // The ratio rarely exceeds 1.2; beyond that the scale stops being useful.
    const scale = (value: number): number => Math.min(value / 1.2, 1) * barWidth;

    ctx.save();
    ctx.fillStyle = 'rgba(6,6,14,0.55)';
    ctx.fillRect(x - 6, y - 16, barWidth + 12, barHeight + 26);

    // Background plus the "pinched" zone (below the low threshold).
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = 'rgba(77,255,176,0.22)';
    ctx.fillRect(x, y, scale(settings.PINCH_ON_RATIO), barHeight);

    // Current ratio.
    ctx.fillStyle = hand.pinching ? '#4dffb0' : '#ffffff';
    ctx.fillRect(x, y, scale(hand.ratio), barHeight);

    // Both thresholds.
    for (const threshold of [settings.PINCH_ON_RATIO, settings.PINCH_OFF_RATIO]) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(x + scale(threshold) - 1, y - 3, 2, barHeight + 6);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `pinch ratio ${hand.ratio.toFixed(2)}${hand.pinching ? ' · PINCHED' : ''}`,
      x,
      y - 4,
    );
    ctx.restore();
    y += 30;
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
      (hand) =>
        `hand${hand.id} ${hand.visible ? 'OK' : '--'} ${(hand.handedness ?? '?').padEnd(5)} ` +
        `ratio ${hand.ratio.toFixed(3)} ${hand.pinching ? '[PINCHED]' : ''}`,
    ),
    `thresholds on<${settings.PINCH_ON_RATIO} off>${settings.PINCH_OFF_RATIO}`,
    `phase ${engine.currentPhaseIndex + 1}`,
    `active targets ${engine.activeTargets().length}  effects ${engine.effects.items.length}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 16, 16 + i * 16));
  ctx.restore();
}
