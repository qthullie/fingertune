import { GRADE_STYLE, gradeFill, settings } from '../config/settings';
import type { GameSnapshot } from '../game/types';
import { useT, type MessageKey } from '../lib/i18n';

interface Props {
  snapshot: GameSnapshot;
  /** Score to chase: a challenge link if there is one, otherwise your best. */
  target: { score: number; label: MessageKey } | null;
}

/**
 * DOM HUD on top of the canvas: score, accuracy, combo, last grade, countdown
 * and progress bar.
 *
 * The snapshot is only republished at ~20 Hz (see GameEngine), so this component
 * does not rerender 60 times a second.
 */
export function Hud({ snapshot, target }: Props): JSX.Element | null {
  const t = useT();
  if (snapshot.phase !== 'playing') return null;

  // Game time starts slightly negative (t=0 is scheduled a few ms ahead so the
  // audio can be queued), so clamp before turning it into a countdown number.
  const countdownLeft = Math.min(
    Math.ceil(Math.max(settings.COUNTDOWN - snapshot.time, 0)),
    Math.ceil(settings.COUNTDOWN),
  );
  const progress = snapshot.duration > 0 ? Math.min(snapshot.time / snapshot.duration, 1) : 0;
  const gradeName = snapshot.lastGrade;
  const grade = gradeName ? GRADE_STYLE[gradeName] : null;
  const offset = snapshot.lastOffsetMs;
  // Signed, so it reads as a race rather than as a number to interpret.
  const delta = target ? snapshot.score - target.score : 0;

  return (
    <div className="hud" aria-live="off">
      <div className="hud-score">
        <div className="hud-score-value">{String(snapshot.score).padStart(7, '0')}</div>
        <div className="hud-accuracy">{snapshot.accuracy.toFixed(2)} %</div>

        {/* The best score was already stored per beatmap and never shown while
            it mattered. Sitting under the live score it turns a solo run into
            a race -- against yourself, or against whoever sent the link. */}
        {target && (
          <div className={`hud-target${delta >= 0 ? ' hud-target--ahead' : ''}`}>
            <span className="hud-target-label">{t(target.label)}</span>
            <span className="hud-target-value">{t.n(target.score)}</span>
            <span className="hud-target-delta">
              {delta >= 0 ? '+' : ''}
              {t.n(delta)}
            </span>
          </div>
        )}
      </div>

      {snapshot.combo > 0 && (
        <div
          key={snapshot.lastEventId}
          className={`hud-combo${snapshot.combo >= 10 ? ' hud-combo--hot' : ''}`}
        >
          {snapshot.combo}x
        </div>
      )}

      {grade && gradeName && (
        <div className="hud-grade" key={`grade-${snapshot.lastEventId}`}>
          <span className="hud-grade-label" style={{ backgroundColor: gradeFill(gradeName) }}>
            {grade.label}
          </span>
          {gradeName !== 'MISS' && (
            <span className="hud-grade-offset">
              {offset >= 0 ? '+' : ''}
              {offset.toFixed(0)} ms {t(offset < 0 ? 'hud.early' : 'hud.late')}
            </span>
          )}
        </div>
      )}

      {!snapshot.handVisible && <div className="hud-warning">{t('hud.noHand')}</div>}

      {/* Phase banner: replayed on every change thanks to the key. */}
      {snapshot.phaseName && (
        <div className="hud-phase-banner" key={`phase-${snapshot.phaseEventId}`}>
          <div className="hud-phase-name">
            {t.or(`phase.${snapshot.phaseId}.name`, snapshot.phaseName)}
          </div>
          <div className="hud-phase-hint">
            {t.or(`phase.${snapshot.phaseId}.hint`, snapshot.phaseHint)}
          </div>
        </div>
      )}

      <div className="hud-status">
        <span>
          {t('hud.phase', { index: snapshot.phaseIndex + 1, count: snapshot.phaseCount })}
        </span>
        {/* Privacy mode is stated, not implied. Someone recording needs to be
            able to check at a glance that the webcam image is not on screen,
            and "I cannot see it" is weaker than the game saying so. */}
        {!settings.SHOW_VIDEO && <span className="hud-privacy">{t('hud.privacy')}</span>}
      </div>

      {countdownLeft > 0 && (
        <div className="hud-countdown" key={`cd-${countdownLeft}`}>
          <div className="hud-countdown-number">{countdownLeft}</div>
          <div className="hud-countdown-hint">{t('hud.countdown')}</div>
        </div>
      )}

      <div className="hud-progress">
        <div className="hud-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
