import { GRADE_STYLE } from '../config/settings';
import type { GameSnapshot } from '../game/types';

interface Props {
  snapshot: GameSnapshot;
  onReplay: () => void;
}

export function EndScreen({ snapshot, onReplay }: Props): JSX.Element {
  return (
    <div className="overlay">
      <h1 className="title">Fini !</h1>
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
      </div>
      <button type="button" onClick={onReplay}>
        Rejouer
      </button>
      <p className="small">Astuce : touche R pour relancer sans passer par ce menu.</p>
    </div>
  );
}
