import { useEffect, useRef } from 'react';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import type { GameEngine } from '../game/engine';
import type { HandTracker } from '../lib/handTracking';
import { renderFrame } from '../render/renderer';
import { computeCoverView, type View } from '../render/view';

interface Props {
  engine: GameEngine;
  tracker: HandTracker;
  /** false met la boucle en pause (ecran de demarrage, erreur…). */
  active: boolean;
}

/**
 * Le canvas et la boucle de jeu.
 *
 * Ordre d'une frame :
 *   1. horloge + tracking          (HandTracker.detect)
 *   2. entrees                     (front montant de pincement -> GameEngine.tryHit)
 *   3. logique                     (GameEngine.update : miss, effets, fin)
 *   4. rendu                       (renderFrame)
 *
 * Le timing du jeu vient de l'horloge audio (voir GameEngine.configure), pas de
 * requestAnimationFrame : un frame drop ne decale donc pas le rythme.
 */
export function GameCanvas({ engine, tracker, active }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ dx: 0, dy: 0, dw: 1, dh: 1, minSide: 1 });
  const fpsRef = useRef(60);

  // Taille du canvas = taille CSS x devicePixelRatio (plafonne a 2 : au dela, le
  // cout de remplissage explose sans gain visible).
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
    viewRef.current = view;

    // 1. Horloge AVANT tout le reste : le hit doit etre juge avec l'instant
    //    ou le pincement est observe, pas avec celui de la frame precedente.
    engine.advanceClock();

    // 2. Tracking. L'horloge de lissage suit le temps de jeu quand on joue.
    const tSec = engine.phase === 'playing' ? engine.time : nowMs / 1000;
    tracker.detect(tSec, nowMs);
    engine.setHandCount(tracker.visibleHandCount);

    // 3. Entrees : un hit par transition relache -> actif.
    for (const hand of tracker.hands) {
      if (hand.visible && hand.justPinched && hand.pinchPos) {
        const hit = engine.tryHit(hand.pinchPos, view);
        // Pincement dans le vide : marqueur discret, pour distinguer "pas
        // detecte" de "detecte mais a cote / hors tempo".
        if (!hit) engine.notePinchMiss(hand.pinchPos);
      }
    }

    // 4. Logique.
    engine.update(dt);

    // 4. Rendu.
    renderFrame({
      ctx,
      width,
      height,
      view,
      video,
      engine,
      hands: tracker.hands,
      fps: fpsRef.current,
    });
  }, active);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
