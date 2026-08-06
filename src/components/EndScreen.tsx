import { useState } from 'react';
import logoUrl from '../../assets/logo.svg';
import { GRADE_STYLE } from '../config/settings';
import type { Beatmap, GameSnapshot } from '../game/types';
import type { RecordResult } from '../lib/highscores';
import { buildChallengeUrl, buildShareText, copyText } from '../lib/challenge';

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
  const isRecord = record?.isRecord ?? false;
  const previous = record?.previous ?? null;
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');

  const beatChallenge = challengeScore !== null && snapshot.score > challengeScore;

  const share = async (): Promise<void> => {
    const ok = await copyText(
      buildShareText({
        beatmapTitle: beatmap.title,
        score: snapshot.score,
        accuracy: snapshot.accuracy,
        maxCombo: snapshot.maxCombo,
        url: buildChallengeUrl(beatmap.id, snapshot.score),
      }),
    );
    setCopied(ok ? 'ok' : 'failed');
  };

  return (
    <div className="overlay">
      <img className="logo logo--small" src={logoUrl} alt="" width={72} height={72} />
      <h1 className="title">
        {beatChallenge ? 'Challenge beaten!' : isRecord ? 'New record!' : 'Run complete'}
      </h1>

      <div className="results">
        <div className="result-main">
          <span className="result-score">{snapshot.score}</span>
          <span className="result-accuracy">{snapshot.accuracy.toFixed(2)} % accuracy</span>
          <span className="result-combo">Max combo {snapshot.maxCombo}x</span>
        </div>
        <div className="result-grades">
          {(['PERFECT', 'GOOD', 'MISS'] as const).map((grade) => (
            <span key={grade} style={{ color: GRADE_STYLE[grade].color }}>
              {GRADE_STYLE[grade].label} {snapshot.counts[grade]}
            </span>
          ))}
        </div>

        {challengeScore !== null && (
          <p className="result-record">
            {beatChallenge
              ? `Challenge was ${challengeScore.toLocaleString()} — beaten by ${(
                  snapshot.score - challengeScore
                ).toLocaleString()}.`
              : `Challenge was ${challengeScore.toLocaleString()} — ${(
                  challengeScore - snapshot.score
                ).toLocaleString()} short.`}
          </p>
        )}
        {isRecord && previous && <p className="result-record">Previous best: {previous.score}</p>}
        {isRecord && !previous && <p className="result-record">First score saved.</p>}
        {!isRecord && record && (
          <p className="result-record">
            Best: {record.best.score} ({record.best.accuracy.toFixed(2)} %)
          </p>
        )}
      </div>

      <button type="button" onClick={onReplay}>
        Play again
      </button>

      {/* A score that cannot leave the machine is a score nobody can be shown.
          The clipboard text carries a link that opens this map with this score
          to beat -- which is the whole of the multiplayer, and it needs no
          server to exist. */}
      <button type="button" className="button--ghost" onClick={() => void share()}>
        {copied === 'ok'
          ? 'Copied — send it to someone'
          : copied === 'failed'
            ? 'Could not copy — select the URL manually'
            : 'Copy result + challenge link'}
      </button>

      <button type="button" className="button--ghost" onClick={onBackToMenu}>
        Change beatmap
      </button>

      <p className="small">Tip: press R to restart without coming back here.</p>
    </div>
  );
}
