interface Props {
  /** Titre de la beatmap qui va se lancer. */
  beatmapTitle: string;
  /** Message d'avancement (chargement du modele, webcam…). */
  status: string;
  loading: boolean;
  onStart: () => void;
}

/**
 * Ecran d'accueil. Le bouton est indispensable : navigateurs et webcam exigent un
 * geste utilisateur pour demarrer la camera ET le contexte audio.
 */
export function StartScreen({ beatmapTitle, status, loading, onStart }: Props): JSX.Element {
  return (
    <div className="overlay">
      <h1 className="title">FINGERTUNE</h1>
      <p className="subtitle">
        Jeu de rythme au <b>pincement</b>. Des cercles apparaissent, un cercle d&apos;approche se
        referme dessus : pince (pouce + index) pile quand il touche la cible.
      </p>
      <ul className="tips">
        <li>Place-toi a ~60–100 cm de la webcam, main bien visible.</li>
        <li>Garde la paume face a la camera.</li>
        <li>
          Un hit = passer de <b>doigts ouverts</b> a <b>doigts pinces</b> sur la cible.
        </li>
        <li>
          <kbd>R</kbd> rejouer · <kbd>M</kbd> metronome · <kbd>D</kbd> debug tracking
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
