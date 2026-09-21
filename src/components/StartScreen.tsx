import logoUrl from '../../assets/logo.svg';
import type { Beatmap } from '../game/types';
import type { BestScore } from '../lib/highscores';
import { loadBest } from '../lib/highscores';
import { useT, type MessageKey } from '../lib/i18n';
import { LangSwitch } from './LangSwitch';
import { PrivacySwitch } from './PrivacySwitch';
import { Rich } from './Rich';

interface Props {
  beatmaps: ReadonlyArray<Beatmap>;
  selected: Beatmap;
  onSelect: (beatmap: Beatmap) => void;
  /** Index into `selected.phases` the run will start from. */
  startPhase: number;
  onSelectPhase: (index: number) => void;
  /** Progress message, already translated by the parent. */
  status: string;
  loading: boolean;
  /** Local best score on the selected beatmap, or null. */
  best: BestScore | null;
  /** The custom-music panel, rendered by the parent that owns the audio. */
  music: JSX.Element;
  /** The chart-import panel, rendered by the parent that owns the catalogue. */
  chartImport: JSX.Element;
  /** False until this hand's pinch range has been measured. */
  calibrated: boolean;
  onRecalibrate: () => void;
  /** True when the webcam image will not be drawn. */
  hideVideo: boolean;
  onHideVideo: (hidden: boolean) => void;
  onStart: () => void;
}

/** The keyboard line, as pairs of key and what it does. */
const SHORTCUTS: ReadonlyArray<readonly [string, MessageKey]> = [
  ['Space', 'key.pause'],
  ['R', 'key.replay'],
  ['V', 'key.video'],
  ['S', 'key.skeleton'],
  ['M', 'key.metronome'],
  ['P', 'key.gauge'],
  ['F', 'key.playfield'],
  ['D', 'key.debug'],
];

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
  chartImport,
  calibrated,
  onRecalibrate,
  hideVideo,
  onHideVideo,
  onStart,
}: Props): JSX.Element {
  const t = useT();
  const startPhaseName = selected.phases[startPhase];

  return (
    <div className="overlay overlay--start">
      <div className="topbar">
        <LangSwitch />
        <PrivacySwitch hidden={hideVideo} onChange={onHideVideo} />
      </div>

      <img className="logo" src={logoUrl} alt="Fingertune" width={104} height={104} />
      <h1 className="title">FINGERTUNE</h1>
      <p className="subtitle">
        <Rich>{t('start.tagline')}</Rich>
      </p>

      {/* --- map picker --------------------------------------------------- */}
      <div className="picker" role="radiogroup" aria-label={t('start.maps.label')}>
        {beatmaps.map((beatmap) => {
          const mapBest = loadBest(beatmap.id);
          const active = beatmap.id === selected.id;
          const meta = t('start.card.meta', { bpm: beatmap.bpm, notes: beatmap.notes.length });
          return (
            <button
              key={beatmap.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`card${active ? ' card--active' : ''}`}
              onClick={() => onSelect(beatmap)}
            >
              <span className="card-title">
                {t.or(`map.${beatmap.id}.title`, beatmap.title)}
              </span>
              <span className="card-meta">
                {meta}
                {beatmap.notes.some((n) => n.hand) ? ` · ${t('start.card.twoHands')}` : ''}
              </span>
              <span className="card-best">
                {mapBest
                  ? t('start.card.best', { score: t.n(mapBest.score) })
                  : t('start.card.never')}
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
      <div className="picker" role="radiogroup" aria-label={t('start.phases.label')}>
        {selected.phases.map((phase, i) => (
          <button
            key={phase.id}
            type="button"
            role="radio"
            aria-checked={i === startPhase}
            className={`chip${i === startPhase ? ' chip--active' : ''}`}
            onClick={() => onSelectPhase(i)}
            title={t.or(`phase.${phase.id}.hint`, phase.hint)}
          >
            {t.or(`phase.${phase.id}.name`, phase.name)}
          </button>
        ))}
      </div>
      {startPhase > 0 && startPhaseName && (
        <p className="small">
          <Rich>
            {t('start.phaseNote', {
              phase: t.or(`phase.${startPhaseName.id}.name`, startPhaseName.name),
            })}
          </Rich>
        </p>
      )}

      {best && (
        <div className="best-score">
          <span className="best-score-label">{t('start.best.label')}</span>
          <span className="best-score-value">{t.n(best.score)}</span>
          <span className="best-score-detail">
            {t('start.best.detail', {
              accuracy: best.accuracy.toFixed(2),
              combo: best.maxCombo,
            })}
          </span>
        </div>
      )}

      <ul className="tips">
        {(
          [
            'start.tip.sit',
            'start.tip.hit',
            'start.tip.slider',
            'start.tip.pause',
            'start.tip.privacy',
          ] as const
        ).map((key) => (
          <li key={key}>
            <Rich>{t(key)}</Rich>
          </li>
        ))}
        <li>
          {SHORTCUTS.map(([key, label], i) => (
            <span key={key}>
              {i > 0 && ' · '}
              <kbd>{key}</kbd> {t(label)}
            </span>
          ))}
        </li>
      </ul>

      {chartImport}
      {music}

      {hideVideo && <p className="small">{t('privacy.hint')}</p>}

      <button type="button" onClick={onStart} disabled={loading}>
        {loading ? t('start.loading') : t('start.play')}
      </button>

      {/* A different chair, a different webcam, a different hand: the measured
          range stops matching, and there has to be a way back to it that is
          not clearing site data. */}
      {calibrated && (
        <button type="button" className="button--ghost" onClick={onRecalibrate}>
          {t('start.recalibrate')}
        </button>
      )}

      <p className="small">{status}</p>
    </div>
  );
}
