/**
 * Night skies: what a phase with `sky` draws instead of paper.
 *
 * The rest of the renderer is ink on paper, and says why. A sky is the one
 * place that turns that around, on purpose and only for the phases that ask:
 * light on dark, additive blending, soft glows. Everything that is not the sky
 * itself -- targets, hands, the gauge -- takes its neutral colours from
 * `NIGHT_INK` and otherwise draws exactly as it does on paper.
 *
 * Back to front:
 *   - the sky colour, cross-faded from one phase to the next;
 *   - a star field that drifts, or rushes outward under `Sky.warp`;
 *   - light: turning rays, a breath on every beat, a shockwave when a new sky
 *     comes in;
 *   - constellations. Every note hit is a star, linked to the one before it
 *     in the same phase unless it starts a new figure (`newFigure`), and a
 *     miss breaks the line. Earlier phases' figures stay up, dimmed, and the
 *     last phase lights them all again, so a run ends on the whole sky the
 *     player drew.
 *
 * Frame time is the constraint: no shadowBlur and no ctx.filter. A glow is a
 * sprite rendered once per colour and stamped with drawImage, and marks that
 * share a style are gathered into one path and drawn in one call -- a few
 * dozen calls a frame where one per star would be several hundred.
 */

import type { GameEngine } from '../game/engine';
import { pointAt, sliderProgress } from '../game/slider';
import type { Target, Vec2 } from '../game/types';
import { toScreen, type Playfield } from './view';

/** Neutral colours for marks drawn over a sky. The paper is the sky itself. */
export const NIGHT_INK = {
  paperShade: '#24203f',
  rule: '#4a4570',
  ink: '#f4f1ff',
  inkSoft: '#b9b4d9',
} as const;

/** Seconds one sky takes to fade into the next. */
const SKY_FADE = 0.8;
/** Seconds the shockwave of a new sky takes to cross the screen. */
const SHOCKWAVE = 1.1;

const STAR_COUNT = 220;
/** Outward travel per second, in star-field depths, at warp 0 and at warp 1. */
const DRIFT = 0.006;
const WARP_SPEED = 0.42;
/** Streak length at full warp, in depth units. */
const STREAK = 0.09;
/**
 * Star brightness and streak width are rounded to this many steps, so the
 * whole field draws as a handful of paths instead of a call per star. Four
 * steps of brightness on a twinkling star is below what the eye can follow.
 */
const STAR_LEVELS = 4;

/** Seconds a constellation line takes to draw itself to a new star. */
const LINE_DRAW = 0.35;
/** Brightness of a figure from an earlier phase. */
const PAST_FIGURE = 0.3;
/** Seconds the last phase takes to bring every earlier figure back. */
const FINALE_FADE = 4;

/**
 * The sky colour this frame, or null when the phase plays on paper.
 *
 * Cross-faded only between two skies: a map that went from paper to sky would
 * want the change to be a cut, the way a lights-out is.
 */
export function skyColor(engine: GameEngine): string | null {
  const sky = engine.currentPhase?.sky;
  if (!sky) return null;
  const before = engine.previousPhase?.sky;
  if (!before) return sky.color;
  return mix(before.color, sky.color, smoothstep(engine.phaseElapsed / SKY_FADE));
}

interface SkyFrame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  engine: GameEngine;
  /** One mark, in logical pixels (see `unit()` in renderer.ts). */
  u: number;
}

/**
 * Everything behind the notes: stars, rays, the beat, the shockwave. The sky
 * colour itself is the background the renderer has already painted.
 */
export function drawSky({ ctx, width, height, engine, u }: SkyFrame): void {
  const sky = engine.currentPhase?.sky;
  if (!sky) return;

  const now = performance.now() / 1000;
  const accent = engine.currentPhase?.color ?? NIGHT_INK.ink;
  const centre = { x: width / 2, y: height / 2 };
  const reach = Math.hypot(width, height) / 2;
  // 1 on the beat, decaying before the next one.
  const beat = engine.beat;
  const onBeat = beat >= 0 ? Math.exp(-(beat - Math.floor(beat)) * 5) * (sky.pulse ?? 0) : 0;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (onBeat > 0.01) {
    ctx.globalAlpha = 0.07 * onBeat;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, width, height);
  }

  if (sky.rays) drawRays(ctx, centre, reach, accent, now, onBeat);
  drawStars(ctx, centre, reach, engine.skyWarp, now, onBeat, u);
  if (engine.previousPhase?.sky) drawShockwave(ctx, centre, reach, accent, engine.phaseElapsed, u);

  ctx.restore();
}

/* ------------------------------------------------------------------- stars ---- */

interface Star {
  angle: number;
  /** Where on its way out the star starts, 0 at the centre to 1 at the edge. */
  depth: number;
  /** Relative speed, so the field does not move as one sheet. */
  speed: number;
  size: number;
  /** Twinkle offset, in radians. */
  phase: number;
}

/** Fixed by a seed: the same sky every run, and no allocation per frame. */
const STARS: Star[] = (() => {
  // mulberry32: tiny, and good enough to scatter points.
  let seed = 0x5eed;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: STAR_COUNT }, () => ({
    angle: random() * Math.PI * 2,
    depth: random(),
    speed: 0.6 + random() * 0.8,
    size: 0.5 + random() * random() * 1.5,
    phase: random() * Math.PI * 2,
  }));
})();

/**
 * How far the field has travelled outward. Integrated rather than computed
 * from the clock, because warp changes speed and a position derived from
 * `time * warp` would jump every time it did.
 */
let travel = 0;
let lastFrame = 0;

/**
 * Stars on their way out from the centre. Radius goes with depth squared, so
 * they crawl in the middle and race at the edges, which is all perspective
 * needs. Under warp each one trails a streak back towards the centre.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  centre: Vec2,
  reach: number,
  warp: number,
  now: number,
  onBeat: number,
  u: number,
): void {
  const dt = lastFrame > 0 ? Math.min(now - lastFrame, 0.05) : 0;
  lastFrame = now;
  travel = (travel + (DRIFT + warp * WARP_SPEED) * dt) % 1;

  // One path of dots per brightness, one of streaks per brightness and width.
  const dots = Array.from({ length: STAR_LEVELS }, () => new Path2D());
  const streaks = Array.from({ length: STAR_LEVELS * STAR_LEVELS }, () => new Path2D());

  for (const star of STARS) {
    const depth = (star.depth + travel * star.speed) % 1;
    const radius = depth * depth * reach;
    const cos = Math.cos(star.angle);
    const sin = Math.sin(star.angle);
    const x = centre.x + cos * radius;
    const y = centre.y + sin * radius;

    const twinkle = 0.7 + 0.3 * Math.sin(now * 2.3 + star.phase);
    // Born faint at the centre rather than popping in.
    const alpha = Math.min(1, depth * 4) * twinkle * Math.min(1, 0.55 + 0.45 * onBeat + depth * 0.4);
    const level = Math.min(STAR_LEVELS - 1, Math.floor(alpha * STAR_LEVELS));
    const size = u * star.size * (0.6 + 1.6 * depth);

    const tail = Math.max(0, depth - warp * STREAK);
    const tailRadius = tail * tail * reach;
    if (radius - tailRadius > size * 1.5) {
      const width = Math.min(STAR_LEVELS - 1, Math.floor(size / u));
      const streak = streaks[level * STAR_LEVELS + width];
      streak?.moveTo(centre.x + cos * tailRadius, centre.y + sin * tailRadius);
      streak?.lineTo(x, y);
    } else {
      // Square, like every other pixel in the game.
      dots[level]?.rect(x - size / 2, y - size / 2, size, size);
    }
  }

  ctx.strokeStyle = NIGHT_INK.ink;
  ctx.fillStyle = NIGHT_INK.ink;
  ctx.lineCap = 'round';
  for (let level = 0; level < STAR_LEVELS; level++) {
    ctx.globalAlpha = (level + 0.75) / STAR_LEVELS;
    const path = dots[level];
    if (path) ctx.fill(path);
    for (let width = 0; width < STAR_LEVELS; width++) {
      const streak = streaks[level * STAR_LEVELS + width];
      if (!streak) continue;
      ctx.lineWidth = u * (width + 0.75);
      ctx.stroke(streak);
    }
  }
}

/* -------------------------------------------------------------------- light ---- */

const RAY_COUNT = 12;
/** Half the angular width of one ray, in radians. */
const RAY_WIDTH = 0.07;

/** Wedges of light turning slowly around the centre, brighter on the beat. */
function drawRays(
  ctx: CanvasRenderingContext2D,
  centre: Vec2,
  reach: number,
  color: string,
  now: number,
  onBeat: number,
): void {
  const fade = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach);
  fade.addColorStop(0, rgba(color, 1));
  fade.addColorStop(1, rgba(color, 0));

  const turn = now * 0.12;
  ctx.beginPath();
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = turn + (i / RAY_COUNT) * Math.PI * 2;
    ctx.moveTo(centre.x, centre.y);
    ctx.lineTo(centre.x + Math.cos(angle - RAY_WIDTH) * reach, centre.y + Math.sin(angle - RAY_WIDTH) * reach);
    ctx.lineTo(centre.x + Math.cos(angle + RAY_WIDTH) * reach, centre.y + Math.sin(angle + RAY_WIDTH) * reach);
    ctx.closePath();
  }
  ctx.globalAlpha = 0.08 + 0.14 * onBeat;
  ctx.fillStyle = fade;
  ctx.fill();
}

/** Two rings racing out from the centre when a new sky comes in. */
function drawShockwave(
  ctx: CanvasRenderingContext2D,
  centre: Vec2,
  reach: number,
  color: string,
  elapsed: number,
  u: number,
): void {
  if (elapsed < 0 || elapsed > SHOCKWAVE) return;
  const k = elapsed / SHOCKWAVE;
  ctx.strokeStyle = color;
  for (const [lag, weight] of [
    [0, 1],
    [0.18, 0.5],
  ] as const) {
    const p = Math.max(0, k - lag);
    if (p <= 0) continue;
    ctx.globalAlpha = (1 - p) * weight;
    ctx.lineWidth = u * (1 + 9 * (1 - p));
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, easeOut(p) * reach, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ---------------------------------------------------------- constellations ---- */

/**
 * The figures the player has drawn so far. Derived entirely from the targets'
 * own state each frame -- which were hit, when, in which phase -- so there is
 * nothing to record, reset, or keep in step with a rewind.
 */
export function drawConstellations(
  ctx: CanvasRenderingContext2D,
  playfield: Playfield,
  engine: GameEngine,
  u: number,
): void {
  const now = engine.time;
  const current = engine.currentPhaseIndex;
  const isFinale = engine.phaseCount > 1 && current === engine.phaseCount - 1;
  const recall = isFinale ? smoothstep(engine.phaseElapsed / FINALE_FADE) : 0;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A phase draws in one colour at one brightness, so everything it drew goes
  // into one path of lines and one of glints, drawn when the next phase starts.
  let layer = null as Layer | null;
  let previous: Target | null = null;
  for (const target of engine.targets) {
    // Targets are sorted by time, so phases arrive in order.
    if (target.phaseIndex > current) break;
    const before = previous;
    previous = target;
    if (!target.hit) continue;

    if (layer?.phaseIndex !== target.phaseIndex) {
      if (layer) drawLayer(ctx, layer, u);
      layer = {
        phaseIndex: target.phaseIndex,
        color: target.color ?? NIGHT_INK.ink,
        brightness: target.phaseIndex === current ? 1 : PAST_FIGURE + (1 - PAST_FIGURE) * recall,
        lines: new Path2D(),
        glints: new Path2D(),
      };
    }

    const age = Math.max(0, now - target.t);
    const head = toScreen(playfield, target);

    // The line in from the previous star, drawn towards this one as it lands.
    if (before?.hit && before.phaseIndex === target.phaseIndex && !target.newFigure) {
      const from = toScreen(playfield, before.points[before.points.length - 1] ?? before);
      const k = Math.min(age / LINE_DRAW, 1);
      layer.lines.moveTo(from.x, from.y);
      layer.lines.lineTo(from.x + (head.x - from.x) * k, from.y + (head.y - from.y) * k);
    }

    if (target.kind === 'slider') traceSlider(layer.lines, playfield, target, now);

    // The star: a glow that lands big and settles, and a four-point glint.
    const settle = 1 + 1.4 * Math.exp(-age * 7);
    const shimmer = 1 + 0.15 * Math.sin(now * 3 + target.id);
    drawGlow(ctx, head, u * 12 * settle * shimmer, layer.color, 0.75 * layer.brightness);
    addGlint(layer.glints, head, u * 4.5 * settle);
  }
  if (layer) drawLayer(ctx, layer, u);
  ctx.restore();
}

/** Everything one phase drew, gathered so it draws in two calls. */
interface Layer {
  phaseIndex: number;
  color: string;
  brightness: number;
  lines: Path2D;
  glints: Path2D;
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, u: number): void {
  ctx.globalAlpha = 0.55 * layer.brightness;
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = u * 1.25;
  ctx.stroke(layer.lines);
  ctx.globalAlpha = layer.brightness;
  ctx.fillStyle = NIGHT_INK.ink;
  ctx.fill(layer.glints);
}

/** The path a slider's ball has covered: the trail of a shooting star. */
function traceSlider(path: Path2D, playfield: Playfield, target: Target, now: number): void {
  const progress = sliderProgress(target, now);
  if (progress <= 0) return;
  const steps = Math.max(2, Math.ceil(target.pathLength * 40 * progress));
  for (let i = 0; i <= steps; i++) {
    const point = toScreen(playfield, pointAt(target, (i / steps) * progress));
    if (i === 0) path.moveTo(point.x, point.y);
    else path.lineTo(point.x, point.y);
  }
}

/** A four-pointed glint, the shape a star takes in every drawing of one. */
function addGlint(path: Path2D, at: Vec2, arm: number): void {
  const waist = arm * 0.18;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const tipX = at.x + Math.cos(angle) * arm;
    const tipY = at.y + Math.sin(angle) * arm;
    const sideX = at.x + Math.cos(angle + Math.PI / 4) * waist;
    const sideY = at.y + Math.sin(angle + Math.PI / 4) * waist;
    if (i === 0) path.moveTo(tipX, tipY);
    else path.lineTo(tipX, tipY);
    path.lineTo(sideX, sideY);
  }
  path.closePath();
}

/* -------------------------------------------------------------------- glows ---- */

const GLOW_SPRITE = 64;
const glowSprites = new Map<string, HTMLCanvasElement>();

/** A soft disc of light, rendered once per colour. */
function glowSprite(color: string): HTMLCanvasElement {
  const cached = glowSprites.get(color);
  if (cached) return cached;

  const sprite = document.createElement('canvas');
  sprite.width = GLOW_SPRITE;
  sprite.height = GLOW_SPRITE;
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const r = GLOW_SPRITE / 2;
    const fade = ctx.createRadialGradient(r, r, 0, r, r, r);
    fade.addColorStop(0, rgba(color, 1));
    fade.addColorStop(0.25, rgba(color, 0.45));
    fade.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, GLOW_SPRITE, GLOW_SPRITE);
  }
  glowSprites.set(color, sprite);
  return sprite;
}

/** Stamps a glow of `radius` pixels. Composite mode is the caller's. */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  at: Vec2,
  radius: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0 || radius <= 0) return;
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), at.x - radius, at.y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = previous;
}

/* ------------------------------------------------------------------ helpers ---- */

function smoothstep(x: number): number {
  const k = Math.min(Math.max(x, 0), 1);
  return k * k * (3 - 2 * k);
}

function easeOut(x: number): number {
  return 1 - (1 - x) ** 3;
}

/** `#rrggbb` to its three channels. */
function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Linear blend of two `#rrggbb` colours, as `#rrggbb`. */
function mix(from: string, to: string, k: number): string {
  const a = channels(from);
  const b = channels(to);
  const blended = a.map((channel, i) => Math.round(channel + ((b[i] ?? 0) - channel) * k));
  return `#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
