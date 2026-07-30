import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { Hud } from './components/Hud';
import { StartScreen } from './components/StartScreen';
import { ErrorScreen } from './components/ErrorScreen';
import { EndScreen } from './components/EndScreen';
import { GameEngine } from './game/engine';
import { HandTracker } from './lib/handTracking';
import { AudioEngine } from './lib/audio';
import { explainError, type FriendlyError } from './lib/errors';
import { defaultBeatmap } from './beatmaps';
import { settings } from './config/settings';

/**
 * Instances uniques, hors du cycle React.
 *
 * Elles possedent des ressources lourdes (webcam, contexte audio, modele wasm) :
 * on ne veut ni les recreer a chaque rendu, ni les liberer sur le double montage
 * de <StrictMode> en dev. Elles vivent le temps de l'onglet.
 */
const engine = new GameEngine();
const tracker = new HandTracker();
const audio = new AudioEngine();

type UiPhase = 'start' | 'playing' | 'end' | 'error';

export function App(): JSX.Element {
  const [uiPhase, setUiPhase] = useState<UiPhase>('start');
  const [status, setStatus] = useState('Modele de hand tracking non charge (~7 Mo au 1er lancement).');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const configuredRef = useRef(false);

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

  /** Lance une partie (suppose modele + camera + audio prets). */
  const startRun = useCallback(() => {
    if (!configuredRef.current) {
      engine.configure({
        // Le timing du jeu suit l'horloge audio, pas rAF.
        clock: () => audio.now(),
        onHitSound: (grade, combo) => audio.playHit(grade, combo),
        onFinish: () => setUiPhase('end'),
      });
      configuredRef.current = true;
    }
    tracker.resetHands();
    audio.setBpm(defaultBeatmap.bpm);
    audio.startTransport();
    engine.start(defaultBeatmap);
    setUiPhase('playing');
  }, []);

  /** Chargement paresseux (doit rester dans le geste utilisateur pour l'audio). */
  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await audio.init();
      await tracker.loadModel(setStatus);
      await tracker.startCamera(setStatus);
      setStatus('Pret.');
      startRun();
    } catch (err) {
      console.error(err);
      setError(explainError(err));
      setUiPhase('error');
    } finally {
      setLoading(false);
    }
  }, [startRun]);

  const handleRetry = useCallback(() => {
    setError(null);
    setUiPhase('start');
  }, []);

  /* Raccourcis clavier : R rejouer, M metronome, D debug. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase();
      if (key === 'r' && tracker.cameraReady) startRun();
      if (key === 'm') settings.METRONOME_ON = !settings.METRONOME_ON;
      if (key === 'd') settings.DEBUG = !settings.DEBUG;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startRun]);

  /* Coupe la musique quand la partie se termine. */
  useEffect(() => {
    if (uiPhase === 'end') audio.stopTransport();
  }, [uiPhase]);

  /* Bac a sable console : window.fingertune.settings.PINCH_ON_RATIO = 0.35 */
  useEffect(() => {
    Object.assign(window, { fingertune: { settings, engine, tracker, audio, beatmap: defaultBeatmap } });
  }, []);

  return (
    <div className="app">
      <GameCanvas engine={engine} tracker={tracker} active={uiPhase === 'playing'} />
      <Hud snapshot={snapshot} />

      {uiPhase === 'start' && (
        <StartScreen
          beatmapTitle={defaultBeatmap.title}
          status={status}
          loading={loading}
          onStart={() => void handleStart()}
        />
      )}
      {uiPhase === 'error' && error && (
        <ErrorScreen message={error.message} detail={error.detail} onRetry={handleRetry} />
      )}
      {uiPhase === 'end' && <EndScreen snapshot={snapshot} onReplay={startRun} />}
    </div>
  );
}
