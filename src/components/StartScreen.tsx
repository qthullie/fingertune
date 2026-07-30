import logoUrl from '../../assets/logo.svg';
import type { BestScore } from '../lib/highscores';

interface Props {
  /** Title of the beatmap about to start. */
  beatmapTitle: string;
  /** Progress message (model loading, webcam…). */
  status: string;
  loading: boolean;
  /** Local best score on this beatmap, or null. */
  best: BestScore | null;
  onStart: () => void;
}

/**
 * Start screen. The button is required: browsers only allow the camera and the
 * audio context to start from a user gesture.
 */
export function StartScreen({ beatmapTitle, status, loading, best, onStart }: Props): JSX.Element {
  return (
    <div className="overlay">
      <img className="logo" src={logoUrl} alt="Fingertune" width={112} height={112} />
      <h1 className="title">FINGERTUNE</h1>
      <p className="subtitle">
        A rhythm game played by <b>pinching</b>. Circles appear with an approach ring closing in
        on them: pinch thumb and index the moment the ring meets the target.
      </p>

      {best && (
        <div className="best-score">
          <span className="best-score-label">Best score</span>
          <span className="best-score-value">{best.score}</span>
          <span className="best-score-detail">
            {best.accuracy.toFixed(2)} % · {best.maxCombo}x combo
          </span>
        </div>
      )}

      <ul className="tips">
        <li>Sit ~60–100 cm from the webcam, one hand clearly visible, palm to the camera.</li>
        <li>
          A hit is going from <b>fingers apart</b> to <b>fingers pinched</b> on the target.
        </li>
        <li>
          Three phases: <b>Easy</b> (very slow, very forgiving), <b>Medium</b>, then <b>Hard</b>.
          The soundtrack grows with them.
        </li>
        <li>
          The <b>gauge at the bottom right</b> shows your live pinch ratio and both thresholds. If
          it never drops into the green zone, it is the detection to tune, not your timing.
        </li>
        <li>
          <kbd>R</kbd> replay · <kbd>M</kbd> metronome · <kbd>S</kbd> skeleton · <kbd>P</kbd> gauge
          · <kbd>F</kbd> playfield · <kbd>D</kbd> debug
        </li>
      </ul>

      <button type="button" onClick={onStart} disabled={loading}>
        {loading ? 'Loading…' : 'Allow webcam / Play'}
      </button>
      <p className="small">
        Beatmap: {beatmapTitle}
        <br />
        {status}
      </p>
    </div>
  );
}
