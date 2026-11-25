/**
 * Two coordinate spaces, and the reason there are two.
 *
 * - `View` is the video rectangle as drawn on the canvas, in CSS-`cover` fit.
 *   Landmarks live here: MediaPipe reports them relative to the camera frame.
 *   In `cover`, that rectangle is usually LARGER than the canvas, so part of it
 *   is off-screen.
 *
 * - `Playfield` is the visible intersection of that rectangle and the canvas,
 *   minus a small margin. Targets live here. Placing a target at x = 0.1 in
 *   video space would put it off-screen on a window whose aspect ratio differs
 *   from the webcam's — unreachable and unhittable.
 *
 * A cursor is converted to pixels through the View, a target through the
 * Playfield, and hit tests happen in pixels. Both spaces then agree on screen.
 */

import { settings } from '../config/settings';
import type { Vec2 } from '../game/types';

export interface Rect {
  /** Top-left corner, in CSS pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** min(width, height): reference for radii, keeps circles circular. */
  minSide: number;
}

export type View = Rect;
export type Playfield = Rect;

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height, minSide: Math.min(width, height) };
}

/** Where the webcam image is drawn, in `cover` fit (it may overflow the canvas). */
export function computeCoverView(
  canvasWidth: number,
  canvasHeight: number,
  videoWidth: number,
  videoHeight: number,
): View {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return rect(0, 0, canvasWidth, canvasHeight);
  }
  const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return rect((canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
}

/**
 * The area targets may occupy: what is both inside the video rectangle and
 * inside the canvas, shrunk by PLAYFIELD_PADDING.
 */
export function computePlayfield(view: View, canvasWidth: number, canvasHeight: number): Playfield {
  const left = Math.max(view.x, 0);
  const top = Math.max(view.y, 0);
  const right = Math.min(view.x + view.width, canvasWidth);
  const bottom = Math.min(view.y + view.height, canvasHeight);

  const width = Math.max(right - left, 1);
  const height = Math.max(bottom - top, 1);
  const padding = settings.PLAYFIELD_PADDING;

  return rect(
    left + width * padding,
    top + height * padding,
    width * (1 - 2 * padding),
    height * (1 - 2 * padding),
  );
}

/** Normalised point inside a rect -> CSS pixels. */
export function toScreen(area: Rect, p: Vec2): Vec2 {
  return { x: area.x + p.x * area.width, y: area.y + p.y * area.height };
}

/** Normalised radius -> pixels. */
export function radiusPx(area: Rect, rNorm: number): number {
  return rNorm * area.minSide;
}

/** Pixel distance between two points already expressed in pixels. */
export function pixelDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
