import { useEffect, useRef, useState } from 'react';
import type { HandTracker } from '../lib/handTracking';
import { computeThresholds, saveCalibration } from '../lib/calibration';
import { settings } from '../config/settings';
import { useT } from '../lib/i18n';
import { Rich } from './Rich';

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
  const t = useT();
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
        <h1 className="title title--plain">{t('calib.failed.title')}</h1>
        <p className="subtitle">{t('calib.failed.body')}</p>
        <button type="button" onClick={onSkip}>
          {t('calib.failed.play')}
        </button>
      </div>
    );
  }

  return (
    <div className="overlay overlay--pause">
      <h1 className="title title--plain">{t('calib.title')}</h1>
      <p className="subtitle">
        <Rich>{t('calib.body')}</Rich>
      </p>

      <div className="calib-bar" aria-hidden="true">
        <div className="calib-bar-fill" style={{ width: `${ratioWidth}%` }} />
      </div>
      <p className="small">
        {seen ? t('calib.ratio', { ratio: ratio.toFixed(2) }) : t('calib.waiting')}
      </p>

      <div className="calib-progress" aria-hidden="true">
        <div className="calib-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <button type="button" className="button--ghost" onClick={onSkip}>
        {t('calib.skip')}
      </button>
    </div>
  );
}
