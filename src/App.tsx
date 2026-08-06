import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { Hud } from './components/Hud';
import { StartScreen } from './components/StartScreen';
import { ErrorScreen } from './components/ErrorScreen';
import { EndScreen } from './components/EndScreen';
import { PauseScreen } from './components/PauseScreen';
import { GameEngine } from './game/engine';
import { HandTracker } from './lib/handTracking';
import { AudioEngine } from './lib/audio';
import { explainError, type FriendlyError } from './lib/errors';
import { loadBest, submitScore, type BestScore, type RecordResult } from './lib/highscores';
import { beatmaps, defaultBeatmap, findBeatmap } from './beatmaps';
import { parseChallenge } from './lib/challenge';
import type { Beatmap } from './game/types';
import { assets, settings } from './config/settings';

/**
 * Single instances, kept outside React's lifecycle.
 *
 * They own heavy resources (webcam, audio context, wasm model): we neither want
 * to recreate them on every render nor release them on <StrictMode>'s double
 * mount in dev. They live as long as the tab does.
 */
const engine = new GameEngine();
const tracker = new HandTracker();
const audio = new AudioEngine();

type UiPhase = 'start' | 'playing' | 'end' | 'error';

export function App(): JSX.Element {
  const [uiPhase, setUiPhase] = useState<UiPhase>('start');
  const [status, setStatus] = useState('Hand-tracking model not loaded yet (~7 MB on first run).');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  /* A challenge link picks the map and the score to chase before anything
     renders, so the player never sees the wrong map selected for a frame. */
  const [challenge] = useState(() => parseChallenge(window.location.hash));
  const [beatmap, setBeatmap] = useState<Beatmap>(
    () => findBeatmap(challenge?.beatmapId) ?? defaultBeatmap,
  );
  const [startPhase, setStartPhase] = useState(0);
  const [best, setBest] = useState<BestScore | null>(() =>
    loadBest(findBeatmap(challenge?.beatmapId)?.id ?? defaultBeatmap.id),
  );
  const [record, setRecord] = useState<RecordResult | null>(null);
  const configuredRef = useRef(false);
  /* `configure` is called once and captures its callbacks, but the selected map
     and phase change afterwards. Refs let those callbacks read the current
     selection without rebinding the audio clock on every state change. */
  const beatmapRef = useRef(beatmap);
  beatmapRef.current = beatmap;
  const phaseRef = useRef(startPhase);
  phaseRef.current = startPhase;

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

  /* A challenge outranks a personal best: someone sent that number on purpose,
     and racing two figures at once is racing neither. */
  const challengeApplies = challenge !== null && challenge.beatmapId === beatmap.id;
  const target = challengeApplies
    ? { score: challenge.score, label: 'Challenge' }
    : best
      ? { score: best.score, label: 'Your best' }
      : null;

  /** Starts a run (assumes model, camera and audio are ready). */
  const startRun = useCallback(() => {
    if (!configuredRef.current) {
      engine.configure({
        // Game timing follows the audio clock, not rAF.
        clock: () => audio.now(),
        onHitSound: (grade, combo) => audio.playHit(grade, combo),
        onMissSound: (brokeCombo) => audio.playMiss(brokeCombo),
        onSliderTick: () => audio.playSliderTick(),
        // The soundtrack steps up on every phase.
        onPhaseChange: (index) => audio.setIntensity(index),
        onPause: () => audio.pauseMusic(),
        onResume: (at) => audio.resumeMusic(at),
        onFinish: () => {
          const final = engine.getSnapshot();
          const result = submitScore(beatmapRef.current.id, {
            score: final.score,
            accuracy: final.accuracy,
            maxCombo: final.maxCombo,
          });
          setRecord(result);
          setBest(result.best);
          setUiPhase('end');
        },
      });
      configuredRef.current = true;
    }
    setRecord(null);
    tracker.resetHands();
    const map = beatmapRef.current;
    audio.setBpm(map.bpm);
    // The music defines t=0, so notes land on the musical grid.
    const startAt = audio.startMusic();
    engine.start(map, startAt, phaseRef.current);
    setUiPhase('playing');
  }, []);

  /** Lazy loading (must stay inside the user gesture for audio to start). */
  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await audio.init();
      // Immediate blip: if you cannot hear it, the problem is the audio output
      // (muted tab, system volume), not the game.
      audio.playTestBlip();
      await audio.loadTrack(assets.musicUrl);
      await tracker.loadModel(setStatus);
      await tracker.startCamera(setStatus);
      setStatus('Ready.');
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

  /* Keyboard shortcuts. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase();
      // Space is the one binding that must not also scroll the page.
      if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        engine.togglePause();
        return;
      }
      if (key === 'escape') engine.pause();
      if (key === 'r' && tracker.cameraReady) startRun();
      if (key === 'm') settings.METRONOME_ON = !settings.METRONOME_ON;
      if (key === 'd') settings.DEBUG = !settings.DEBUG;
      if (key === 's') settings.SHOW_SKELETON = !settings.SHOW_SKELETON;
      if (key === 'p') settings.SHOW_PINCH_METER = !settings.SHOW_PINCH_METER;
      if (key === 'f') settings.SHOW_PLAYFIELD = !settings.SHOW_PLAYFIELD;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startRun]);

  /* Stop the music when the run ends. */
  useEffect(() => {
    if (uiPhase === 'end') audio.stopMusic();
  }, [uiPhase]);

  /* Console sandbox: window.fingertune.settings.PINCH_ON_RATIO = 0.35 */
  useEffect(() => {
    Object.assign(window, {
      fingertune: { settings, engine, tracker, audio, beatmaps },
    });
  }, []);

  return (
    <div className="app">
      <GameCanvas engine={engine} tracker={tracker} active={uiPhase === 'playing'} />
      <Hud snapshot={snapshot} target={target} />

      {uiPhase === 'start' && (
        <StartScreen
          beatmaps={beatmaps}
          selected={beatmap}
          onSelect={(next) => {
            setBeatmap(next);
            setStartPhase(0);
            setBest(loadBest(next.id));
          }}
          startPhase={startPhase}
          onSelectPhase={setStartPhase}
          status={status}
          loading={loading}
          best={best}
          onStart={() => void handleStart()}
        />
      )}
      {uiPhase === 'error' && error && (
        <ErrorScreen message={error.message} detail={error.detail} onRetry={handleRetry} />
      )}
      {uiPhase === 'playing' && snapshot.phase === 'paused' && (
        <PauseScreen
          auto={snapshot.autoPaused}
          onResume={() => engine.resume()}
          onRestart={startRun}
        />
      )}
      {uiPhase === 'end' && (
        <EndScreen
          snapshot={snapshot}
          beatmap={beatmap}
          record={record}
          challengeScore={challengeApplies ? challenge.score : null}
          onReplay={startRun}
          onBackToMenu={() => setUiPhase('start')}
        />
      )}
    </div>
  );
}
