import { GRADE_STYLE, settings } from '../config/settings';
import type { GameSnapshot } from '../game/types';

interface Props {
  snapshot: GameSnapshot;
}

/**
 * HUD en DOM par dessus le canvas : score, precision, combo, dernier grade,
 * decompte et barre de progression.
 *
 * Le snapshot n'est republie qu'a ~20 Hz (voir GameEngine), donc ce composant ne
 * re-rend pas 60 fois par seconde.
 */
export function Hud({ snapshot }: Props): JSX.Element | null {
  if (snapshot.phase !== 'playing') return null;

  const countdownLeft = Math.ceil(settings.COUNTDOWN - snapshot.time);
  const progress = snapshot.duration > 0 ? Math.min(snapshot.time / snapshot.duration, 1) : 0;
  const grade = snapshot.lastGrade ? GRADE_STYLE[snapshot.lastGrade] : null;
  const offset = snapshot.lastOffsetMs;

  return (
    <div className="hud" aria-live="off">
      <div className="hud-score">
        <div className="hud-score-value">{String(snapshot.score).padStart(7, '0')}</div>
        <div className="hud-accuracy">{snapshot.accuracy.toFixed(2)} %</div>
      </div>

      {snapshot.combo > 0 && (
        <div
          key={snapshot.lastEventId}
          className={`hud-combo${snapshot.combo >= 10 ? ' hud-combo--hot' : ''}`}
        >
          {snapshot.combo}x
        </div>
      )}

      {grade && (
        <div className="hud-grade" key={`grade-${snapshot.lastEventId}`} style={{ color: grade.color }}>
          <span className="hud-grade-label">{grade.label}</span>
          {snapshot.lastGrade !== 'MISS' && (
            <span className="hud-grade-offset">
              {offset >= 0 ? '+' : ''}
              {offset.toFixed(0)} ms {offset < 0 ? '(tot)' : '(tard)'}
            </span>
          )}
        </div>
      )}

      {!snapshot.handVisible && (
        <div className="hud-warning">Main non detectee — montre ta main a la camera</div>
      )}

      {/* Banniere de phase : rejouee a chaque changement grace a la key. */}
      {snapshot.phaseName && (
        <div className="hud-phase-banner" key={`phase-${snapshot.phaseEventId}`}>
          <div className="hud-phase-name">{snapshot.phaseName}</div>
          <div className="hud-phase-hint">{snapshot.phaseHint}</div>
        </div>
      )}

      <div className="hud-status">
        <span>
          Phase {snapshot.phaseIndex + 1}/{snapshot.phaseCount}
        </span>
        <span className={snapshot.handCount >= 2 ? 'hud-hands--duo' : undefined}>
          {snapshot.handCount} main{snapshot.handCount > 1 ? 's' : ''} suivie
          {snapshot.handCount > 1 ? 's' : ''}
        </span>
      </div>

      {countdownLeft > 0 && (
        <div className="hud-countdown" key={`cd-${countdownLeft}`}>
          <div className="hud-countdown-number">{countdownLeft}</div>
          <div className="hud-countdown-hint">Prepare ta main…</div>
        </div>
      )}

      <div className="hud-progress">
        <div className="hud-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
