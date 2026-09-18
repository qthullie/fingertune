import { useEffect, useRef, useState } from 'react';
import type { HandTracker } from '../lib/handTracking';
import { computeThresholds, saveCalibration } from '../lib/calibration';
import { settings } from '../config/settings';

interface Props {
  tracker: HandTracker;
  onDone: () => void;
  onSkip: () => void;
}

const DURATION = 6;

/**
 * Six seconds of opening and closing the hand, turned into thresholds.
 *
 * It samples on its own rAF loop rather than the game's: the engine is idle
 * here, and this needs the raw ratio every frame, which is the one thing the
 * game loop deliberately does not publish to React.
 *
 * The live ratio bar is not decoration. It is the only way a player can tell
 * that the camera is seeing their hand at all, and the difference between "this
 * is measuring me" and "this is a progress bar" decides whether they open their
 * hand properly for the second half.
 */
export function CalibrationScreen({ tracker, onDone, onSkip }: Props): JSX.Element {
  const [elapsed, setElapsed] = useState(0);
  const [ratio, setRatio] = useState(1);
  const [seen, setSeen] = useState(false);
  const [failed, setFailed] = useState(false);
  const samples = useRef<number[]>([]);

  useEffect(() => {
    let frame = 0;
    const t0 = performance.now();
    samples.current = [];

    const loop = (): void => {
      const t = (performance.now() - t0) / 1000;
      const hand = tracker.hands[0];

      if (hand?.visible) {
        samples.current.push(hand.ratio);
        setRatio(hand.ratio);
        setSeen(true);
      }
      setElapsed(t);

      if (t >= DURATION) {
        const result = computeThresholds(samples.current);
        if (result) {
          settings.PINCH_ON_RATIO = result.onRatio;
          settings.PINCH_OFF_RATIO = result.offRatio;
          saveCalibration({ onRatio: result.onRatio, offRatio: result.offRatio });
          onDone();
        } else {
          // Not enough of a sweep to be worth trusting. The defaults stay.
          setFailed(true);
        }
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [tracker, onDone]);

  const progress = Math.min(elapsed / DURATION, 1);
  // 1.2 is a comfortable ceiling: a fully open hand rarely exceeds it.
  const ratioWidth = Math.min(ratio / 1.2, 1) * 100;

  if (failed) {
    return (
      <div className="overlay overlay--pause">
        <h1 className="title">Could not read a pinch</h1>
        <p className="subtitle">
          Your hand needs to be fully visible, and to actually open and close. The default
          thresholds are still in place and the game is playable — you can try again or just go.
        </p>
        <button type="button" onClick={onSkip}>
          Play anyway
        </button>
      </div>
    );
  }

  return (
    <div className="overlay overlay--pause">
      <h1 className="title">Calibrating</h1>
      <p className="subtitle">
        Open your hand wide, then pinch thumb and index together. <b>Three times</b>, slowly, in
        front of the camera.
      </p>

      <div className="calib-bar" aria-hidden="true">
        <div className="calib-bar-fill" style={{ width: `${ratioWidth}%` }} />
      </div>
      <p className="small">
        {seen ? `Pinch ratio ${ratio.toFixed(2)}` : 'Waiting for a hand…'}
      </p>

      <div className="calib-progress" aria-hidden="true">
        <div className="calib-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <button type="button" className="button--ghost" onClick={onSkip}>
        Skip — use the defaults
      </button>
    </div>
  );
}
