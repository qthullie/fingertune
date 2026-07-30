import logoUrl from '../../assets/logo.svg';
import { GRADE_STYLE } from '../config/settings';
import type { GameSnapshot } from '../game/types';
import type { RecordResult } from '../lib/highscores';

interface Props {
  snapshot: GameSnapshot;
  /** Result of submitting the score (record beaten or not). */
  record: RecordResult | null;
  onReplay: () => void;
}

export function EndScreen({ snapshot, record, onReplay }: Props): JSX.Element {
  const isRecord = record?.isRecord ?? false;
  const previous = record?.previous ?? null;

  return (
    <div className="overlay">
      <img className="logo logo--small" src={logoUrl} alt="" width={72} height={72} />
      <h1 className="title">{isRecord ? 'New record!' : 'Run complete'}</h1>

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
      <p className="small">Tip: press R to restart without coming back here.</p>
    </div>
  );
}
