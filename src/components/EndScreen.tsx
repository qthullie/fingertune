import logoUrl from '../../assets/logo.svg';
import { GRADE_STYLE } from '../config/settings';
import type { GameSnapshot } from '../game/types';
import type { RecordResult } from '../lib/highscores';

interface Props {
  snapshot: GameSnapshot;
  /** Resultat de la soumission du score (record battu ou non). */
  record: RecordResult | null;
  onReplay: () => void;
}

export function EndScreen({ snapshot, record, onReplay }: Props): JSX.Element {
  const isRecord = record?.isRecord ?? false;
  const previous = record?.previous ?? null;

  return (
    <div className="overlay">
      <img className="logo logo--small" src={logoUrl} alt="" width={72} height={72} />
      <h1 className="title">{isRecord ? 'Nouveau record !' : 'Fini !'}</h1>

      <div className="results">
        <div className="result-main">
          <span className="result-score">{snapshot.score}</span>
          <span className="result-accuracy">{snapshot.accuracy.toFixed(2)} % de precision</span>
          <span className="result-combo">Combo max {snapshot.maxCombo}x</span>
        </div>
        <div className="result-grades">
          {(['PERFECT', 'GOOD', 'MISS'] as const).map((grade) => (
            <span key={grade} style={{ color: GRADE_STYLE[grade].color }}>
              {GRADE_STYLE[grade].label} {snapshot.counts[grade]}
            </span>
          ))}
        </div>

        {isRecord && previous && (
          <p className="result-record">Ancien record : {previous.score}</p>
        )}
        {isRecord && !previous && <p className="result-record">Premier score enregistre.</p>}
        {!isRecord && record && (
          <p className="result-record">
            Meilleur score : {record.best.score} ({record.best.accuracy.toFixed(2)} %)
          </p>
        )}
      </div>

      <button type="button" onClick={onReplay}>
        Rejouer
      </button>
      <p className="small">Astuce : touche R pour relancer sans passer par ce menu.</p>
    </div>
  );
}
