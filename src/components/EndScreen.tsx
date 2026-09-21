import { useState } from 'react';
import logoUrl from '../../assets/logo.svg';
import { GRADE_STYLE, gradeFill } from '../config/settings';
import type { Beatmap, GameSnapshot } from '../game/types';
import type { RecordResult } from '../lib/highscores';
import { buildChallengeUrl, copyText } from '../lib/challenge';
import { useT } from '../lib/i18n';
import { Leaderboard } from './Leaderboard';

interface Props {
  snapshot: GameSnapshot;
  beatmap: Beatmap;
  /** Result of submitting the score (record beaten or not). */
  record: RecordResult | null;
  /** Score this run was chasing, if it was opened from a challenge link. */
  challengeScore: number | null;
  onReplay: () => void;
  onBackToMenu: () => void;
}

export function EndScreen({
  snapshot,
  beatmap,
  record,
  challengeScore,
  onReplay,
  onBackToMenu,
}: Props): JSX.Element {
  const t = useT();
  const isRecord = record?.isRecord ?? false;
  const previous = record?.previous ?? null;
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');

  const beatChallenge = challengeScore !== null && snapshot.score > challengeScore;
  const mapTitle = t.or(`map.${beatmap.id}.title`, beatmap.title);

  /*
   * The share text is built here rather than in lib/challenge, because it is
   * the one string in the app whose language is a real decision: it is written
   * by the player, for someone else, in whatever language they are playing in.
   */
  const share = async (): Promise<void> => {
    const ok = await copyText(
      [
        t('end.share.line1', { map: mapTitle }),
        t('end.share.line2', {
          score: t.n(snapshot.score),
          accuracy: snapshot.accuracy.toFixed(2),
          combo: snapshot.maxCombo,
        }),
        t('end.share.line3', { url: buildChallengeUrl(beatmap.id, snapshot.score) }),
      ].join('\n'),
    );
    setCopied(ok ? 'ok' : 'failed');
  };

  return (
    <div className="overlay">
      <img className="logo logo--small" src={logoUrl} alt="" width={72} height={72} />
      <h1 className="title title--plain">
        {beatChallenge
          ? t('end.title.challenge')
          : isRecord
            ? t('end.title.record')
            : t('end.title.done')}
      </h1>

      <div className="results">
        <div className="result-main">
          <span className="result-score">{t.n(snapshot.score)}</span>
          <span className="result-accuracy">
            {t('end.accuracy', { accuracy: snapshot.accuracy.toFixed(2) })}
          </span>
          <span className="result-combo">{t('end.maxCombo', { combo: snapshot.maxCombo })}</span>
        </div>
        <div className="result-grades">
          {/* The count sits on a block of the grade's colour rather than being
              written in it: ink on cyan is 8:1, cyan on white is 2.2:1, and it
              is the same colour either way round. */}
          {(['PERFECT', 'GOOD', 'MISS'] as const).map((grade) => (
            <span
              key={grade}
              className="result-grade"
              style={{ backgroundColor: gradeFill(grade) }}
            >
              {GRADE_STYLE[grade].label} {snapshot.counts[grade]}
            </span>
          ))}
        </div>

        {challengeScore !== null && (
          <p className="result-record">
            {beatChallenge
              ? t('end.challenge.beaten', {
                  score: t.n(challengeScore),
                  delta: t.n(snapshot.score - challengeScore),
                })
              : t('end.challenge.short', {
                  score: t.n(challengeScore),
                  delta: t.n(challengeScore - snapshot.score),
                })}
          </p>
        )}
        {isRecord && previous && (
          <p className="result-record">{t('end.previous', { score: t.n(previous.score) })}</p>
        )}
        {isRecord && !previous && <p className="result-record">{t('end.first')}</p>}
        {!isRecord && record && (
          <p className="result-record">
            {t('end.best', {
              score: t.n(record.best.score),
              accuracy: record.best.accuracy.toFixed(2),
            })}
          </p>
        )}
      </div>

      <Leaderboard
        beatmapId={beatmap.id}
        run={{
          score: snapshot.score,
          accuracy: snapshot.accuracy,
          maxCombo: snapshot.maxCombo,
        }}
      />

      <button type="button" onClick={onReplay}>
        {t('end.replay')}
      </button>

      {/* A score that cannot leave the machine is a score nobody can be shown.
          The clipboard text carries a link that opens this map with this score
          to beat -- which is the whole of the multiplayer, and it needs no
          server to exist. */}
      <button type="button" className="button--ghost" onClick={() => void share()}>
        {copied === 'ok'
          ? t('end.share.ok')
          : copied === 'failed'
            ? t('end.share.failed')
            : t('end.share')}
      </button>

      <button type="button" className="button--ghost" onClick={onBackToMenu}>
        {t('end.changeMap')}
      </button>

      <p className="small">{t('end.tip')}</p>
    </div>
  );
}
