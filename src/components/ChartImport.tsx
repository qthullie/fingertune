import { useState } from 'react';
import { importChart, ChartImportError } from '../lib/chartImport';
import type { Beatmap } from '../game/types';
import { useT } from '../lib/i18n';

interface Props {
  /** Called with a chart the player brought, and its track when there was one. */
  onImport: (beatmap: Beatmap, audioUrl: string | null, label: string) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; label: string; notes: number; missingAudio: string | null }
  | { kind: 'failed'; message: string };

/**
 * Bring your own chart.
 *
 * Authoring a beatmap by hand costs an evening per minute of music, so a game
 * that ships four of them has four forever. osu! and StepMania between them
 * have a public library of hundreds of thousands, in plain-text formats that
 * describe close enough to the same thing — and the conversion is honest about
 * what it drops (see lib/osu.ts and lib/stepmania.ts).
 *
 * Collapsed by default, and below the built-in maps, because it is the second
 * thing anyone does. The first is press play.
 */
export function ChartImport({ onImport }: Props): JSX.Element {
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const pick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setState({ kind: 'loading' });
    try {
      const result = await importChart(file);
      onImport(result.beatmap, result.audioUrl, result.label);
      setState({
        kind: 'loaded',
        label: result.label,
        notes: result.beatmap.notes.length,
        missingAudio: result.missingAudio,
      });
    } catch (err) {
      // Every thrown message here is written to be read by a player, so it is
      // shown as-is rather than replaced by a generic failure.
      const message =
        err instanceof ChartImportError || err instanceof Error
          ? err.message
          : t('chart.failed');
      setState({ kind: 'failed', message });
    }
  };

  return (
    <details className="music">
      <summary>{t('chart.summary')}</summary>

      <div className="music-body">
        <label className="music-file">
          <input
            type="file"
            accept=".osz,.osu,.sm,.zip"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <span>{state.kind === 'loading' ? t('chart.loading') : t('chart.choose')}</span>
        </label>

        {state.kind === 'loaded' && (
          <p className="small">
            {t('chart.loaded', { label: state.label, notes: state.notes })}
            {state.missingAudio && (
              <>
                <br />
                {t('chart.noAudio', { file: state.missingAudio })}
              </>
            )}
          </p>
        )}

        {state.kind === 'failed' && <p className="small chart-error">{state.message}</p>}

        <p className="small">{t('chart.caveat')}</p>
      </div>
    </details>
  );
}
