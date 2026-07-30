/**
 * Slider geometry: a polyline walked at constant speed.
 *
 * The ball must move at a steady pace whatever the shape, so positions are
 * interpolated by ARC LENGTH, not by segment index — otherwise a short segment
 * and a long one would take the same time and the ball would lurch.
 */

import type { Target, Vec2 } from './types';

export interface PreparedPath {
  points: Vec2[];
  /** Distance from the first point to each point, along the path. */
  cumulative: number[];
  /** Total length, in normalised playfield units. */
  length: number;
}

/** Builds the cumulative-length table for a polyline. */
export function prepareSliderPath(points: ReadonlyArray<Vec2>): PreparedPath {
  const list = points.map((p) => ({ x: p.x, y: p.y }));
  const cumulative: number[] = [0];
  let total = 0;

  for (let i = 1; i < list.length; i++) {
    const previous = list[i - 1];
    const current = list[i];
    if (!previous || !current) continue;
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
    cumulative.push(total);
  }

  return { points: list, cumulative, length: total };
}

/**
 * How far along the slider we are at game time `now`, in 0..1.
 * Clamped: before the head it is 0, after the end it is 1.
 */
export function sliderProgress(target: Target, now: number): number {
  if (target.duration <= 0) return 1;
  return Math.min(Math.max((now - target.t) / target.duration, 0), 1);
}

/** Position on the path for a progress value in 0..1. */
export function pointAt(target: Target, progress: number): Vec2 {
  const { points, cumulative, pathLength } = target;
  const first = points[0] ?? { x: target.x, y: target.y };
  if (points.length < 2 || pathLength <= 0) return first;

  const wanted = Math.min(Math.max(progress, 0), 1) * pathLength;

  // Segments are few (a handful per slider), so a linear scan is cheaper than
  // the branch-heavy binary search it would replace.
  for (let i = 1; i < points.length; i++) {
    const startLength = cumulative[i - 1];
    const endLength = cumulative[i];
    const a = points[i - 1];
    const b = points[i];
    if (startLength === undefined || endLength === undefined || !a || !b) continue;
    if (wanted > endLength) continue;

    const span = endLength - startLength;
    const k = span > 1e-9 ? (wanted - startLength) / span : 0;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  return points[points.length - 1] ?? first;
}

/** Unit direction of travel at a progress value (for the direction arrows). */
export function directionAt(target: Target, progress: number): Vec2 {
  const ahead = pointAt(target, Math.min(progress + 0.02, 1));
  const behind = pointAt(target, Math.max(progress - 0.02, 0));
  const dx = ahead.x - behind.x;
  const dy = ahead.y - behind.y;
  const length = Math.hypot(dx, dy);
  return length > 1e-6 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
}
