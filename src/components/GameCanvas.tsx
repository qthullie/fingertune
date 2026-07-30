import { useEffect, useRef } from 'react';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import type { CursorInput, GameEngine } from '../game/engine';
import type { HandTracker } from '../lib/handTracking';
import { renderFrame } from '../render/renderer';
import { computeCoverView, computePlayfield, toScreen } from '../render/view';

interface Props {
  engine: GameEngine;
  tracker: HandTracker;
  /** false pauses the loop (start screen, error screen…). */
  active: boolean;
}

/**
 * The canvas and the game loop.
 *
 * Order within a frame:
 *   1. clock       (GameEngine.advanceClock, audio clock)
 *   2. tracking    (HandTracker.detect)
 *   3. input       (pinch rising edge -> GameEngine.tryHit)
 *   4. sliders     (held pinch -> GameEngine.trackSliders)
 *   5. logic       (GameEngine.update: misses, effects, end of run)
 *   6. render      (renderFrame)
 *
 * Game timing comes from the audio clock (see GameEngine.configure), not from
 * requestAnimationFrame, so a dropped frame never shifts the beat.
 */
export function GameCanvas({ engine, tracker, active }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef(60);

  // Canvas size = CSS size x devicePixelRatio (capped at 2: beyond that the fill
  // cost explodes for no visible gain).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, []);

  useAnimationFrame((dt, nowMs) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    fpsRef.current = fpsRef.current * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const video = tracker.video;
    const view = computeCoverView(width, height, video?.videoWidth ?? 0, video?.videoHeight ?? 0);
    const playfield = computePlayfield(view, width, height);

    // 1. Clock first: a hit must be judged with the instant the pinch is seen,
    //    not with the previous frame's.
    engine.advanceClock();

    // 2. Tracking. The smoothing clock follows game time while playing.
    const tSec = engine.phase === 'playing' ? engine.time : nowMs / 1000;
    tracker.detect(tSec, nowMs);
    engine.setHandCount(tracker.visibleHandCount);

    // 3. Input. The cursor lives in video space, targets in playfield space, so
    //    both are converted to pixels before being compared.
    const cursors: CursorInput[] = [];
    for (const hand of tracker.hands) {
      if (!hand.visible || !hand.pinchPos) continue;
      const cursorPx = toScreen(view, hand.pinchPos);
      cursors.push({ position: cursorPx, pinching: hand.pinching });

      // One hit per released -> active transition.
      if (!hand.justPinched) continue;
      const hit = engine.tryHit(cursorPx, playfield);
      // Pinch into thin air: leave a marker, so "not detected" is
      // distinguishable from "detected but off-target or off-beat".
      if (!hit) engine.notePinchMiss(cursorPx, playfield);
    }

    // 4. Sliders need the pinch held, so they are tracked every frame, not just
    //    on the rising edge.
    engine.trackSliders(cursors, playfield, dt);

    // 5. Logic.
    engine.update(dt);

    // 6. Render.
    renderFrame({
      ctx,
      width,
      height,
      view,
      playfield,
      video,
      engine,
      hands: tracker.hands,
      fps: fpsRef.current,
    });
  }, active);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
