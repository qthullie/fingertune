import { useEffect, useRef } from 'react';

/**
 * Boucle requestAnimationFrame stable : le callback peut changer a chaque rendu
 * React sans relancer ni desynchroniser la boucle.
 *
 * @param callback recoit (dtSeconds, nowMs). dt est borne pour eviter les sauts
 *                 apres un changement d'onglet.
 * @param active   met la boucle en pause quand false.
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
