import { useEffect, useRef } from 'react';

/**
 * Stable requestAnimationFrame loop: the callback can change on every React
 * render without restarting or desynchronising the loop.
 *
 * @param callback receives (dtSeconds, nowMs). dt is clamped to avoid a jump
 *                 after the tab has been in the background.
 * @param active   pauses the loop when false.
 */
export function useAnimationFrame(
  callback: (dt: number, nowMs: number) => void,
  active = true,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;
    let frameId = 0;
    let last = 0;

    const tick = (nowMs: number): void => {
      frameId = requestAnimationFrame(tick);
      const dt = last ? Math.min((nowMs - last) / 1000, 0.05) : 1 / 60;
      last = nowMs;
      callbackRef.current(dt, nowMs);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active]);
}
