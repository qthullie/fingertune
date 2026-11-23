/**
 * Canvas rendering: mirrored video, targets and approach rings, effects, hands.
 *
 * The HUD (score, combo, grade) is React DOM on top of the canvas: easier to
 * read, easier to restyle, and it avoids redrawing text at 60 fps.
 *
 * Two decisions run through the whole file.
 *
 * Everything draws on paper, not on a dark room: the canvas backs onto white,
 * and the webcam frame, when drawn at all, sits under a white veil. So marks
 * are ink-dark with colour used sparingly — the opposite of the usual
 * glow-on-black rhythm game — and `shadowBlur` appears nowhere, because a white
 * halo on a white background is nothing.
 *
 * And the playfield is drawn smooth. The pixel art is the logo and the
 * interface around it; the thing you are aiming at is a circle, and a circle
 * quantised onto a coarse grid is a circle you have to interpret before you can
 * hit it. Raising `PIXEL_SCALE` above 1 turns the whole canvas blocky for
 * anyone who wants that, and `unit()` below is what keeps every mark the same
 * weight on screen when they do.
 *
 * Phases with a `sky` are the exception to the paper, and sky.ts explains it.
 * Here it only means the neutral colours come from the frame's `Ink` rather
 * than straight from PALETTE.
 */

import psychedelicUrl from '../assets/psychedelic.mp4';
import { PALETTE, settings } from '../config/settings';
import type { GameEngine } from '../game/engine';
import { directionAt, pointAt, sliderProgress } from '../game/slider';
import type { Target } from '../game/types';
import { HAND_CONNECTIONS, LANDMARK_COUNT, type HandState } from '../lib/handTracking';
import { NIGHT_INK, drawConstellations, drawGlow, drawSky, skyColor } from './sky';
import { fireEdges, radiusPx, toScreen, type Playfield, type View } from './view';

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  /** Size of the drawing surface, in logical pixels (see GameCanvas). */
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
  /** True when inference runs in a worker. Shown in the debug overlay. */
  threaded: boolean;
}

/**
 * The weight of one mark, in logical pixels.
 *
 * At `PIXEL_SCALE` 1 a logical pixel is a CSS pixel; at 3 it is a third of one,
 * blown back up. Deriving every line width and marker size from this means a
 * hairline stays a hairline on screen either way, instead of a 2px rule
 * becoming a 6px slab the moment somebody turns the grain up.
 */
function unit(): number {
  return settings.PIXEL_SCALE >= 2 ? 1 : 2;
}

interface Strokes {
  /** One mark, in logical pixels. */
  u: number;
  hair: number;
  thin: number;
  bold: number;
  heavy: number;
}

function strokes(): Strokes {
  const u = unit();
  return { u, hair: u, thin: u * 1.5, bold: u * 2.5, heavy: u * 4 };
}

/** Flat alpha over a solid colour, since `rgba()` literals are gone. */
function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * alpha;
  draw();
  ctx.globalAlpha = previous;
}

/**
 * The neutral colours of a frame: paper and ink, or their counterparts on a
 * night sky. Colour proper -- the logo's two hues, phase accents, the red of a
 * miss -- is the same on both.
 */
interface Ink {
  paper: string;
  paperShade: string;
  rule: string;
  ink: string;
  inkSoft: string;
  /** Drawing on a sky: light marks, and light that adds up instead of covering. */
  night: boolean;
}

const DAY_INK: Ink = {
  paper: PALETTE.paper,
  paperShade: PALETTE.paperShade,
  rule: PALETTE.rule,
  ink: PALETTE.ink,
  inkSoft: PALETTE.inkSoft,
  night: false,
};

interface Frame extends RenderInput {
  ink: Ink;
}

export function renderFrame(input: RenderInput): void {
  const sky = skyColor(input.engine);
  const frame: Frame = { ...input, ink: sky ? { ...NIGHT_INK, paper: sky, night: true } : DAY_INK };

  drawBackground(frame);
  if (frame.ink.night) {
    drawSky({ ctx: frame.ctx, width: frame.width, height: frame.height, engine: frame.engine, u: unit() });
    drawConstellations(frame.ctx, frame.playfield, frame.engine, unit());
  }
  drawPsychedelic(frame);
  if (settings.SHOW_PLAYFIELD) drawPlayfield(frame);
  drawFireWalls(frame);
  drawTargets(frame);
  drawEffects(frame);
  drawHands(frame);
  if (settings.SHOW_PINCH_METER) drawPinchMeter(frame);
  if (settings.DEBUG) drawDebug(frame);
}

/* ------------------------------------------------------------------ video ---- */

/**
 * Paper first, then the webcam frame on top of it — or not.
 *
 * `SHOW_VIDEO === false` is privacy mode: the frame is never painted, so the
 * room, the people in it and whatever is on the wall behind you never reach the
 * canvas, the screen recorder or the stream. The hand is still tracked from
 * that same frame; only the `drawImage` is skipped.
 *
 * With the video on, a white veil sits over it. Without the veil the targets
 * compete with a photograph for attention, and the photograph wins.
 */
function drawBackground({ ctx, width, height, view, video, ink }: Frame): void {
  ctx.fillStyle = ink.paper;
  ctx.fillRect(0, 0, width, height);

  if (!settings.SHOW_VIDEO || !video || video.videoWidth === 0) return;

  ctx.save();
  // Mirrored: without this the game is unplayable, the hand moves the wrong way.
  ctx.translate(view.x + view.width, view.y);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, view.width, view.height);
  ctx.restore();

  // Heavier on a sky: the stars are faint, and a room behind them is not.
  withAlpha(ctx, ink.night ? 0.88 : 0.62, () => {
    ctx.fillStyle = ink.paper;
    ctx.fillRect(0, 0, width, height);
  });
}

/** How much of the psychedelic video shows through: a tint, not a wall. */
const PSYCHEDELIC_ALPHA = 0.2;

let psychedelicVideo: HTMLVideoElement | null = null;

/**
 * Psychedelic phases: the looping rainbow tunnel (scripts/make-psychedelic-video.mjs)
 * over the whole canvas, faint enough that the notes stay the thing to read.
 * Every hit turns its hue. The element is made on first use and paused while
 * no such phase plays.
 */
function drawPsychedelic({ ctx, width, height, engine }: RenderInput): void {
  if (!engine.currentPhase?.psychedelic) {
    if (psychedelicVideo && !psychedelicVideo.paused) psychedelicVideo.pause();
    return;
  }
  if (!psychedelicVideo) {
    psychedelicVideo = document.createElement('video');
    psychedelicVideo.src = psychedelicUrl;
    psychedelicVideo.muted = true;
    psychedelicVideo.loop = true;
    psychedelicVideo.playsInline = true;
  }
  const clip = psychedelicVideo;
  if (clip.paused) void clip.play().catch(() => undefined);
  if (clip.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  // Cover the canvas, cropping whichever side overflows.
  const scale = Math.max(width / clip.videoWidth, height / clip.videoHeight);
  const w = clip.videoWidth * scale;
  const h = clip.videoHeight * scale;
  ctx.save();
  ctx.globalAlpha = PSYCHEDELIC_ALPHA;
  ctx.filter = `hue-rotate(${Math.round(engine.bgHueOffset % 360)}deg)`;
  ctx.drawImage(clip, (width - w) / 2, (height - h) / 2, w, h);
  ctx.restore();
}

/** Debug outline of the area targets can occupy. */
function drawPlayfield({ ctx, playfield, ink }: Frame): void {
  const stroke = strokes();
  ctx.save();
  ctx.strokeStyle = ink.rule;
  ctx.lineWidth = stroke.hair;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(playfield.x, playfield.y, playfield.width, playfield.height);
  ctx.restore();
}

/* --------------------------------------------------------------- fire walls --- */

/**
 * One flame tongue licking towards the centre, in three frames. One character
 * per pixel: o orange, y yellow, w white-hot, r red tip, '.' empty.
 */
const FLAME_FRAMES = [
  ['oor.......', 'ooyor.....', 'oyyyoorr..', 'oywwyyoorr', 'oyyyyoor..', 'ooyoor....', 'oor.......'],
  ['oorrr.....', 'ooyyoorr..', 'oyywyoorr.', 'oywwyor...', 'oyyor.....', 'ooor......', 'oor.......'],
  ['oor.......', 'ooor......', 'oyyor.....', 'oywwyor...', 'oyywyoorr.', 'ooyyoorr..', 'oorrr.....'],
] as const;

/** Painted in this order: the base before the embers on it. */
const FLAME_COLORS = new Map([
  ['r', '#E4252F'],
  ['o', '#FF7A00'],
  ['y', '#FFD23F'],
  ['w', '#FFF6C8'],
]);

/**
 * Flame walls closing in from both sides: a burning base with pixel-art tongues
 * climbing its inner edge, tips exactly on the line that burns.
 *
 * The tint behind covers the whole burning area, so the gap between two
 * flickering tongues never reads as a safe spot.
 */
function drawFireWalls({ ctx, width, height, playfield, engine }: RenderInput): void {
  const margin = engine.fireZoneMargin;
  if (margin <= 0) return;
  const edges = fireEdges(playfield, margin);
  const px = Math.max(3, Math.round(height / 140));
  const rows = FLAME_FRAMES[0].length;
  const length = FLAME_FRAMES[0][0].length * px;
  const period = rows * px;
  const t = performance.now() / 1000;
  const tick = Math.floor(t * 10);
  // Whole pixels only, or the sprite smears.
  const climbed = t * 40;
  const climb = Math.round(climbed % period);
  const passed = Math.floor(climbed / period);

  const walls = [
    [edges.left, false],
    [width - edges.right, true],
  ] as const;

  for (const [depth, mirrored] of walls) {
    ctx.save();
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    withAlpha(ctx, 0.3, () => {
      ctx.fillStyle = '#FF7A00';
      ctx.fillRect(0, 0, depth, height);
    });

    const paths = new Map<string, Path2D>();
    for (const key of FLAME_COLORS.keys()) paths.set(key, new Path2D());

    const x0 = Math.round(depth - length);
    if (x0 > 0) {
      paths.get('o')?.rect(0, 0, x0, height);
      // Embers: a cheap hash per cell, reshuffled ten times a second.
      for (let c = 0; c * px < x0; c++) {
        for (let r = 0; r * px < height; r++) {
          const h = Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663) ^ Math.imul(tick, 83492791);
          if (h % 7 === 0) paths.get('y')?.rect(c * px, r * px, px, px);
        }
      }
    }

    // Each tongue keeps its own flicker as it climbs, hence `passed`.
    for (let i = 0, top = -climb; top < height; i++, top += period) {
      const frame = FLAME_FRAMES[(tick + (i + passed) * 2) % FLAME_FRAMES.length]!;
      frame.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          paths.get(row.charAt(c))?.rect(x0 + c * px, top + r * px, px, px);
        }
      });
    }

    for (const [key, color] of FLAME_COLORS) {
      const path = paths.get(key);
      if (!path) continue;
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- targets ---- */

/**
 * Slider body: the path to follow, its direction, and the ball.
 *
 * Drawn under the head so the note to grab stays the most visible thing. The
 * body turns magenta while the pinch is being held on the ball, and red once
 * the ball has been dropped.
 */
function drawSlider(
  ctx: CanvasRenderingContext2D,
  playfield: Playfield,
  target: Target,
  now: number,
  rTarget: number,
  ink: Ink,
): void {
  if (target.points.length < 2) return;

  const screen = target.points.map((point) => toScreen(playfield, point));
  const first = screen[0];
  if (!first) return;

  const stroke = strokes();
  const started = now >= target.t;
  const holding = target.sliderState === 'holding';
  const dropped = target.sliderState === 'dropped';
  // Magenta means "you have it": the logo's ring colour is the one that closes.
  const accent = holding ? PALETTE.pink : dropped ? PALETTE.red : (target.color ?? PALETTE.cyan);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < screen.length; i++) {
      const point = screen[i];
      if (point) ctx.lineTo(point.x, point.y);
    }
  };

  // Casing: paper, so the track carves a channel out of whatever is behind it.
  trace();
  ctx.strokeStyle = ink.paper;
  ctx.lineWidth = rTarget * 2 + stroke.heavy;
  ctx.stroke();

  // Fill, then the outline that gives it an edge on white.
  trace();
  withAlpha(ctx, 0.22, () => {
    ctx.strokeStyle = accent;
    ctx.lineWidth = rTarget * 2;
    ctx.stroke();
  });

  trace();
  ctx.strokeStyle = accent;
  ctx.lineWidth = stroke.thin;
  ctx.stroke();

  // Direction arrows: which way to drag. Spaced along the path, not per segment,
  // so the spacing stays even on an uneven polyline.
  const arrowCount = Math.max(2, Math.round(target.pathLength * 14));
  for (let i = 1; i <= arrowCount; i++) {
    const progress = i / (arrowCount + 1);
    const at = toScreen(playfield, pointAt(target, progress));
    const dir = directionAt(target, progress);
    const size = Math.min(rTarget * 0.42, stroke.u * 7);

    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(Math.atan2(dir.y, dir.x));
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = stroke.thin;
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size * 0.55);
    ctx.lineTo(size * 0.5, 0);
    ctx.lineTo(-size * 0.5, size * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  // Tail marker.
  const tail = screen[screen.length - 1];
  if (tail) {
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = stroke.thin;
    ctx.beginPath();
    ctx.arc(tail.x, tail.y, rTarget * 0.75, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The ball, once the slider is running.
  if (started) {
    const progress = sliderProgress(target, now);
    const ball = toScreen(playfield, pointAt(target, progress));

    // Follow circle: shows how much slack you have while holding.
    if (holding || dropped) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = stroke.thin;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, rTarget * settings.SLIDER_FOLLOW_SCALE, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = holding ? PALETTE.pink : ink.paper;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, rTarget * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = stroke.thin;
    ctx.stroke();
  }

  ctx.restore();
}

function drawHazard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  strokeW: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ff2200';
  ctx.globalAlpha *= 0.18;
  ctx.fill();
  ctx.globalAlpha /= 0.18;

  ctx.strokeStyle = '#ff3300';
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const start = (i / segs) * Math.PI * 2 + 0.12;
    const end = ((i + 0.72) / segs) * Math.PI * 2 - 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.lineWidth = strokeW * 1.5;
    ctx.stroke();
    const mid = (start + end) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(mid) * r, cy + Math.sin(mid) * r);
    ctx.lineTo(cx + Math.cos(mid) * (r + r * 0.22), cy + Math.sin(mid) * (r + r * 0.22));
    ctx.lineWidth = strokeW * 0.6;
    ctx.stroke();
  }

  const xr = r * 0.35;
  ctx.strokeStyle = '#ff3300';
  ctx.lineWidth = strokeW * 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - xr, cy - xr); ctx.lineTo(cx + xr, cy + xr);
  ctx.moveTo(cx + xr, cy - xr); ctx.lineTo(cx - xr, cy + xr);
  ctx.stroke();

  ctx.restore();
}

function drawTargets({ ctx, playfield, engine, ink }: Frame): void {
  const now = engine.time;
  const stroke = strokes();

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

    const inPerfect = Math.abs(now - target.t) <= target.perfectWindow;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Hazard circle: draw warning visual + red approach ring, then skip normal drawing.
    if (target.kind === 'hazard') {
      drawHazard(ctx, p.x, p.y, rTarget, stroke.bold, inPerfect ? 1.0 : 0.7);
      if (progress <= 1.05) {
        const k = Math.min(progress, 1);
        const rApproach = rTarget * (settings.APPROACH_START - (settings.APPROACH_START - 1) * k);
        withAlpha(ctx, 0.4 + 0.6 * k, () => {
          ctx.lineWidth = stroke.bold;
          ctx.strokeStyle = '#ff3300';
          ctx.beginPath();
          ctx.arc(p.x, p.y, rApproach, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      ctx.restore();
      continue;
    }

    // Slider body first: the head is drawn on top of it.
    if (target.kind === 'slider') drawSlider(ctx, playfield, target, now, rTarget, ink);

    // Once a slider is grabbed, its head is done; only the body still matters.
    if (target.kind === 'slider' && target.sliderState !== 'pending') {
      ctx.restore();
      continue;
    }

    // On a sky the target gathers light as its ring closes, so the note to
    // play next is the brightest thing on screen before it is the largest.
    if (ink.night) {
      const k = Math.min(progress, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, p, rTarget * (1.6 + k), target.color ?? PALETTE.cyan, 0.15 + 0.35 * k + (inPerfect ? 0.3 : 0));
      ctx.restore();
    }

    // Disc: one flat colour. The logo's cyan is the target's colour, and the
    // target filling in is the whole cue the player is reading.
    withAlpha(ctx, inPerfect ? 0.9 : 0.4, () => {
      ctx.fillStyle = target.color ?? PALETTE.cyan;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rTarget, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ring: ink at rest, magenta on the beat.
    ctx.lineWidth = inPerfect ? stroke.bold : stroke.thin;
    ctx.strokeStyle = inPerfect ? PALETTE.pink : ink.ink;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rTarget, 0, Math.PI * 2);
    ctx.stroke();

    // Approach ring: reaches the target radius exactly on the beat, in the
    // phase's colour when it has one.
    if (progress <= 1.05) {
      const k = Math.min(progress, 1);
      const rApproach = rTarget * (settings.APPROACH_START - (settings.APPROACH_START - 1) * k);
      withAlpha(ctx, 0.35 + 0.65 * k, () => {
        ctx.lineWidth = target.color ? stroke.bold : stroke.thin;
        ctx.strokeStyle = target.color ?? PALETTE.pink;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rApproach, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- effects ---- */

function drawEffects({ ctx, width, height, playfield, engine, ink }: Frame): void {
  const { effects } = engine;
  const stroke = strokes();
  // On a sky, effects are light: they add up and glow instead of covering.
  const blend: GlobalCompositeOperation = ink.night ? 'lighter' : 'source-over';

  for (const effect of effects.items) {
    const p = toScreen(playfield, effect);
    // Effects made in ink (a GOOD, a stray pinch) follow the ink, or they
    // would be dark marks on a dark sky.
    const color = effect.color === PALETTE.ink ? ink.ink : effect.color;
    ctx.save();
    ctx.globalCompositeOperation = blend;
    ctx.globalAlpha = Math.max(0, effect.life);
    if (effect.kind === 'particle') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, effect.size * effect.life * stroke.u * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.kind === 'ghost') {
      // Pinch recognised, nothing hit: a small ring that tightens.
      const r = radiusPx(playfield, settings.TARGET_RADIUS) * (0.55 + effect.life * 0.35);
      ctx.globalAlpha = Math.max(0, effect.life) * 0.65;
      ctx.strokeStyle = color;
      ctx.lineWidth = stroke.hair;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.kind === 'ring') {
      const r = radiusPx(playfield, settings.TARGET_RADIUS) * (1 + (1 - effect.life) * 1.8);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(stroke.hair, stroke.bold * effect.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const r = radiusPx(playfield, settings.TARGET_RADIUS) * 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = stroke.bold;
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
    ctx.globalCompositeOperation = blend;
    // Halved: a full-strength flash of colour over white is a white-out.
    ctx.globalAlpha = effects.flashAmount * 0.5;
    ctx.fillStyle = effects.flashColor;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ hands ---- */

/** Accent colour per hand: slot 0 cyan, slot 1 magenta — the logo's two hues. */
function handAccent(hand: HandState): string {
  return hand.id === 0 ? PALETTE.cyan : PALETTE.pink;
}

/**
 * Full skeleton: 21 landmarks joined by HAND_CONNECTIONS.
 *
 * Two passes, a wide paper stroke then a narrow coloured one. On the webcam
 * image the paper pass is what keeps the bones legible over a dark sleeve; in
 * privacy mode it is invisible and costs nothing.
 */
function drawSkeleton(ctx: CanvasRenderingContext2D, view: View, hand: HandState, ink: Ink): void {
  const points = hand.landmarks;
  if (points.length < LANDMARK_COUNT) return;

  const screen = points.map((p) => toScreen(view, p));
  const accent = handAccent(hand);
  const stroke = strokes();

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? ink.paper : accent;
    ctx.lineWidth = pass === 0 ? stroke.heavy : stroke.thin;
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
  const tips = new Set([4, 8, 12, 16, 20]);
  for (let i = 0; i < screen.length; i++) {
    const p = screen[i];
    if (!p) continue;
    ctx.fillStyle = tips.has(i) ? accent : ink.ink;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (tips.has(i) ? 2 : 1.3) * stroke.u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHands({ ctx, view, hands, ink }: Frame): void {
  const stroke = strokes();

  for (const hand of hands) {
    if (!hand.visible || !hand.thumb || !hand.index || !hand.pinchPos) continue;

    // Skeleton first: it sits under the pinch markers.
    if (settings.SHOW_SKELETON) drawSkeleton(ctx, view, hand, ink);

    const thumb = toScreen(view, hand.thumb);
    const index = toScreen(view, hand.index);
    const mid = toScreen(view, hand.pinchPos);
    const accent = handAccent(hand);

    ctx.save();
    ctx.lineCap = 'round';

    // Thumb-index line: thickens and turns magenta while the pinch is active.
    ctx.lineWidth = hand.pinching ? stroke.heavy : stroke.thin;
    ctx.strokeStyle = hand.pinching ? PALETTE.pink : ink.ink;
    ctx.beginPath();
    ctx.moveTo(thumb.x, thumb.y);
    ctx.lineTo(index.x, index.y);
    ctx.stroke();

    // Fingertips, in the hand's colour, outlined so they read on white.
    for (const point of [thumb, index]) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(point.x, point.y, (hand.pinching ? 4.5 : 3.5) * stroke.u, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = stroke.hair;
      ctx.stroke();
    }

    drawCursor(ctx, mid, hand.pinching, stroke, ink);
    ctx.restore();
  }
}

/**
 * The cursor: a bracket around the midpoint.
 *
 * It was a full circle, which on this playfield is one more circle among the
 * targets and the approach rings. A bracket is the only mark on screen that is
 * not round, so the eye finds the hand without first having to tell it apart
 * from a note.
 */
function drawCursor(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  pinching: boolean,
  stroke: Strokes,
  ink: Ink,
): void {
  const half = (pinching ? 7 : 5.5) * stroke.u;
  const arm = half * 0.55;

  ctx.strokeStyle = pinching ? PALETTE.pink : ink.ink;
  ctx.lineWidth = pinching ? stroke.bold : stroke.thin;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const cx = at.x + dx * half;
    const cy = at.y + dy * half;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - dx * arm, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - dy * arm);
  }
  ctx.stroke();

  // Centre dot: the exact point hit tests use, so a near-miss is explainable.
  ctx.fillStyle = pinching ? PALETTE.pink : ink.ink;
  ctx.beginPath();
  ctx.arc(at.x, at.y, stroke.u, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------ pinch meter ---- */

/**
 * Pinch gauge, one per tracked hand.
 *
 * Shows the live ratio and both hysteresis thresholds. This is the most direct
 * diagnosis available: if the bar never drops below the low threshold when you
 * pinch, the problem is detection (threshold, lighting, hand angle), not the
 * game. It matters more in privacy mode, where the webcam image is no longer
 * there to tell you the camera is working.
 */
function drawPinchMeter({ ctx, width, height, hands, ink }: Frame): void {
  const visible = hands.filter((hand) => hand.visible);
  if (visible.length === 0) return;

  const { u, hair } = strokes();
  const barWidth = 66 * u;
  const barHeight = 4 * u;
  const x = width - barWidth - 12 * u;
  let y = height - 18 * u - (visible.length - 1) * 18 * u;

  for (const hand of visible) {
    // The ratio rarely exceeds 1.2; beyond that the scale stops being useful.
    const scale = (value: number): number => Math.min(value / 1.2, 1) * barWidth;

    ctx.save();
    ctx.fillStyle = ink.paper;
    ctx.fillRect(x - 4 * u, y - 10 * u, barWidth + 8 * u, barHeight + 14 * u);
    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = hair;
    ctx.strokeRect(x - 4 * u, y - 10 * u, barWidth + 8 * u, barHeight + 14 * u);

    // Track, plus the "pinched" zone (below the low threshold).
    ctx.fillStyle = ink.paperShade;
    ctx.fillRect(x, y, barWidth, barHeight);
    withAlpha(ctx, 0.3, () => {
      ctx.fillStyle = PALETTE.pink;
      ctx.fillRect(x, y, scale(settings.PINCH_ON_RATIO), barHeight);
    });

    // Current ratio.
    ctx.fillStyle = hand.pinching ? PALETTE.pink : handAccent(hand);
    ctx.fillRect(x, y, scale(hand.ratio), barHeight);

    // Both thresholds.
    for (const threshold of [settings.PINCH_ON_RATIO, settings.PINCH_OFF_RATIO]) {
      ctx.fillStyle = ink.ink;
      ctx.fillRect(x + scale(threshold) - u / 2, y - u, u, barHeight + 2 * u);
    }

    ctx.fillStyle = ink.inkSoft;
    ctx.font = `600 ${5.5 * u}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`pinch ${hand.ratio.toFixed(2)}${hand.pinching ? ' · PINCHED' : ''}`, x, y - 3 * u);
    ctx.restore();
    y += 18 * u;
  }
}

/* ------------------------------------------------------------------ debug ---- */

function drawDebug({ ctx, engine, hands, fps, threaded, ink }: Frame): void {
  const u = unit();
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `500 ${6 * u}px monospace`;
  ctx.fillStyle = ink.ink;
  const lines = [
    `fps ${fps.toFixed(0)}   t ${engine.time.toFixed(2)}s`,
    ...hands.map(
      (hand) =>
        `hand${hand.id} ${hand.visible ? 'OK' : '--'} ${(hand.handedness ?? '?').padEnd(5)} ` +
        `ratio ${hand.ratio.toFixed(3)} ${hand.pinching ? '[PINCHED]' : ''}`,
    ),
    `thresholds on<${settings.PINCH_ON_RATIO} off>${settings.PINCH_OFF_RATIO}`,
    `phase ${engine.currentPhaseIndex + 1}  pixel scale ${settings.PIXEL_SCALE}`,
    `inference ${threaded ? 'worker' : 'INLINE'}  predict ${(settings.PREDICT_AHEAD * 1000).toFixed(0)}ms`,
    `video ${settings.SHOW_VIDEO ? 'on' : 'PRIVACY'}  skeleton ${settings.SHOW_SKELETON ? 'on' : 'off'}`,
    `active targets ${engine.activeTargets().length}  effects ${engine.effects.items.length}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 8 * u, 8 * u + i * 8 * u));
  ctx.restore();
}
