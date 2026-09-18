import logoUrl from '../../assets/logo.svg';
import type { Beatmap } from '../game/types';
import type { BestScore } from '../lib/highscores';
import { loadBest } from '../lib/highscores';

interface Props {
  beatmaps: ReadonlyArray<Beatmap>;
  selected: Beatmap;
  onSelect: (beatmap: Beatmap) => void;
  /** Index into `selected.phases` the run will start from. */
  startPhase: number;
  onSelectPhase: (index: number) => void;
  /** Progress message (model loading, webcam…). */
  status: string;
  loading: boolean;
  /** Local best score on the selected beatmap, or null. */
  best: BestScore | null;
  /** The custom-music panel, rendered by the parent that owns the audio. */
  music: JSX.Element;
  /** False until this hand's pinch range has been measured. */
  calibrated: boolean;
  onRecalibrate: () => void;
  onStart: () => void;
}

/**
 * Start screen. The button is required: browsers only allow the camera and the
 * audio context to start from a user gesture.
 *
 * The map list is the reason this screen grew. One beatmap meant there was
 * nothing to choose and no reason to come back; three means the first decision
 * a player makes is which one, and the best score sits on each card so that
 * choice carries some history.
 */
export function StartScreen({
  beatmaps,
  selected,
  onSelect,
  startPhase,
  onSelectPhase,
  status,
  loading,
  best,
  music,
  calibrated,
  onRecalibrate,
  onStart,
}: Props): JSX.Element {
  return (
    <div className="overlay overlay--start">
      <img className="logo" src={logoUrl} alt="Fingertune" width={112} height={112} />
      <h1 className="title">FINGERTUNE</h1>
      <p className="subtitle">
        A rhythm game played by <b>pinching</b>. Circles appear with an approach ring closing in
        on them: pinch thumb and index the moment the ring meets the target.
      </p>

      {/* --- map picker --------------------------------------------------- */}
      <div className="picker" role="radiogroup" aria-label="Beatmap">
        {beatmaps.map((beatmap) => {
          const mapBest = loadBest(beatmap.id);
          const active = beatmap.id === selected.id;
          return (
            <button
              key={beatmap.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`card${active ? ' card--active' : ''}`}
              onClick={() => onSelect(beatmap)}
            >
              <span className="card-title">{beatmap.title}</span>
              <span className="card-meta">
                {beatmap.bpm} BPM · {beatmap.notes.length} notes
                {beatmap.notes.some((n) => n.hand) ? ' · two hands' : ''}
              </span>
              <span className="card-best">
                {mapBest ? `Best ${mapBest.score.toLocaleString()}` : 'Never played'}
              </span>
            </button>
          );
        })}
      </div>

      {/* --- phase picker -------------------------------------------------
          Every phase carries its own windows and ring speed, so starting at
          the third one is a real run at that difficulty rather than a
          fast-forward. Someone who has cleared the map twice should not have
          to sit through the teaching section to reach the part they want. */}
      <div className="picker picker--phases" role="radiogroup" aria-label="Starting difficulty">
        {selected.phases.map((phase, i) => (
          <button
            key={phase.id}
            type="button"
            role="radio"
            aria-checked={i === startPhase}
            className={`chip${i === startPhase ? ' chip--active' : ''}`}
            onClick={() => onSelectPhase(i)}
            title={phase.hint}
          >
            {phase.name}
          </button>
        ))}
      </div>
      {startPhase > 0 && (
        <p className="small">
          Starting at <b>{selected.phases[startPhase]?.name}</b> — scores from a partial run are
          still saved.
        </p>
      )}

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
          <b>Sliders</b>: pinch the head, then <b>keep pinching</b> and drag along the track,
          following the ball in the direction of the arrows, all the way to the end.
        </li>
        <li>
          Lose your hand and the run <b>pauses itself</b> — bring it back and it carries on.
        </li>
        <li>
          <kbd>Space</kbd> pause · <kbd>R</kbd> replay · <kbd>M</kbd> metronome · <kbd>S</kbd>{' '}
          skeleton · <kbd>P</kbd> gauge · <kbd>F</kbd> playfield · <kbd>D</kbd> debug
        </li>
      </ul>

      {music}

      <button type="button" onClick={onStart} disabled={loading}>
        {loading ? 'Loading…' : 'Allow webcam / Play'}
      </button>

      {/* A different chair, a different webcam, a different hand: the measured
          range stops matching, and there has to be a way back to it that is
          not clearing site data. */}
      {calibrated && (
        <button type="button" className="button--ghost" onClick={onRecalibrate}>
          Recalibrate my pinch
        </button>
      )}

      <p className="small">{status}</p>
    </div>
  );
}
