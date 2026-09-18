import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Name of the loaded track, or null while the generated one is in use. */
  trackName: string | null;
  /** Called with an object URL for the chosen file. */
  onPick: (url: string, name: string) => void;
  onClear: () => void;
  bpm: number;
  onBpm: (bpm: number) => void;
}

/** Taps older than this start a new measurement rather than extending one. */
const TAP_RESET_MS = 2000;
const MIN_BPM = 40;
const MAX_BPM = 220;

/**
 * Play over your own track.
 *
 * `VITE_MUSIC_URL` already existed, but at build time — which makes it a
 * feature for whoever deploys the game, not for whoever plays it. The file
 * never leaves the machine: `URL.createObjectURL` hands the audio element a
 * local handle, so this stays as offline as the rest of the game.
 *
 * The honest caveat, said on screen rather than hidden: the beatmap keeps its
 * own grid. Matching the BPM lines the metronome and the note spacing up with
 * the track, but nothing here detects the first downbeat, so a track that does
 * not start exactly on one will sit at a constant offset. Tap tempo is a tool
 * for getting close, not a beat detector.
 */
export function MusicPicker({ trackName, onPick, onClear, bpm, onBpm }: Props): JSX.Element {
  const [taps, setTaps] = useState<number[]>([]);
  const urlRef = useRef<string | null>(null);

  // Object URLs are held by the browser until revoked; the tab can outlive
  // several track changes.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const pick = (file: File | undefined): void => {
    if (!file) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    onPick(url, file.name);
  };

  const tap = (): void => {
    const now = performance.now();
    setTaps((previous) => {
      const last = previous.at(-1);
      const kept = last !== undefined && now - last > TAP_RESET_MS ? [] : previous;
      const next = [...kept, now].slice(-8);

      if (next.length >= 3) {
        // Mean of the intervals across the whole window, not the last one:
        // a single late tap should nudge the estimate, not replace it.
        const first = next[0] ?? now;
        const span = now - first;
        const measured = Math.round(60000 / (span / (next.length - 1)));
        if (measured >= MIN_BPM && measured <= MAX_BPM) onBpm(measured);
      }
      return next;
    });
  };

  return (
    <details className="music">
      <summary>Play over your own music</summary>

      <div className="music-body">
        <label className="music-file">
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <span>{trackName ?? 'Choose an audio file'}</span>
        </label>

        {trackName && (
          <button type="button" className="button--ghost" onClick={onClear}>
            Back to the generated track
          </button>
        )}

        <div className="music-bpm">
          <button type="button" className="button--ghost" onClick={tap}>
            Tap tempo
          </button>
          <label>
            BPM
            <input
              type="number"
              min={MIN_BPM}
              max={MAX_BPM}
              value={bpm}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= MIN_BPM && value <= MAX_BPM) onBpm(value);
              }}
            />
          </label>
          {taps.length > 0 && taps.length < 3 && (
            <span className="small">Keep tapping…</span>
          )}
        </div>

        <p className="small">
          The notes keep the beatmap&apos;s own grid. Matching the BPM lines the spacing up with
          your track, but the first downbeat is not detected — if the track does not start on one,
          everything will sit at a constant offset. Your file never leaves this machine.
        </p>
      </div>
    </details>
  );
}
