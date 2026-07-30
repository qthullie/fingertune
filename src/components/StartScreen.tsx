import logoUrl from '../../assets/logo.svg';
import type { BestScore } from '../lib/highscores';

interface Props {
  /** Titre de la beatmap qui va se lancer. */
  beatmapTitle: string;
  /** Message d'avancement (chargement du modele, webcam…). */
  status: string;
  loading: boolean;
  /** Meilleur score local sur cette beatmap, ou null. */
  best: BestScore | null;
  onStart: () => void;
}

/**
 * Ecran d'accueil. Le bouton est indispensable : navigateurs et webcam exigent un
 * geste utilisateur pour demarrer la camera ET le contexte audio.
 */
export function StartScreen({ beatmapTitle, status, loading, best, onStart }: Props): JSX.Element {
  return (
    <div className="overlay">
      <img className="logo" src={logoUrl} alt="Fingertune" width={112} height={112} />
      <h1 className="title">FINGERTUNE</h1>
      <p className="subtitle">
        Jeu de rythme au <b>pincement</b>. Des cercles apparaissent, un cercle d&apos;approche se
        referme dessus : pince (pouce + index) pile quand il touche la cible.
      </p>

      {best && (
        <div className="best-score">
          <span className="best-score-label">Meilleur score</span>
          <span className="best-score-value">{best.score}</span>
          <span className="best-score-detail">
            {best.accuracy.toFixed(2)} % · combo {best.maxCombo}x
          </span>
        </div>
      )}

      <ul className="tips">
        <li>Place-toi a ~60–100 cm de la webcam, mains bien visibles.</li>
        <li>Garde les paumes face a la camera.</li>
        <li>
          Un hit = passer de <b>doigts ouverts</b> a <b>doigts pinces</b> sur la cible.
        </li>
        <li>
          <b>Deux mains</b> : la phase 3 envoie des cibles simultanees, une de chaque cote.
        </li>
        <li>
          Trois phases : <b>tres lent</b>, puis plus rapide, puis les deux mains. La musique
          monte avec.
        </li>
        <li>
          <kbd>R</kbd> rejouer · <kbd>M</kbd> metronome · <kbd>S</kbd> squelette ·{' '}
          <kbd>D</kbd> debug tracking
        </li>
      </ul>

      <button type="button" onClick={onStart} disabled={loading}>
        {loading ? 'Chargement…' : 'Autoriser la webcam / Jouer'}
      </button>
      <p className="small">
        Beatmap : {beatmapTitle}
        <br />
        {status}
      </p>
    </div>
  );
}
