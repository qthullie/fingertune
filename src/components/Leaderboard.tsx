import { useEffect, useState } from 'react';
import {
  fetchBoard,
  hasBoard,
  submitScore,
  type BoardEntry,
  type BoardStatus,
  type RunScore,
} from '../lib/leaderboard';
import { NICKNAME_MAX, loadNickname, playerId, sanitizeNickname } from '../lib/player';
import { useT, type MessageKey } from '../lib/i18n';

interface Props {
  beatmapId: string;
  /** The run that just finished, offered for submission. Absent, the board is read-only. */
  run?: RunScore;
  /** Rows shown. The start screen shows fewer: it is a glance, not the end of a run. */
  limit?: number;
}

const STATUS_KEY: Record<Exclude<BoardStatus, 'ok' | 'not-configured'>, MessageKey> = {
  offline: 'board.offline',
  timeout: 'board.timeout',
  rejected: 'board.rejected',
  taken: 'board.taken',
};

/**
 * The online board: on the start screen for the selected map, and on the end
 * screen with the run offered for posting.
 *
 * It renders nothing at all when no board is configured, or for an imported
 * chart. The game shipped without one and still works without one, so an
 * empty panel saying "no leaderboard" would be a feature advertising its own
 * absence.
 *
 * On the end screen it loads the board before anything is submitted, so the
 * run can be read against the field without joining it. Posting is a choice,
 * and it asks for a name first — the whole point of the board is the name.
 *
 * It never blocks the screen it sits on. Every failure comes back as a status
 * and becomes one sentence.
 */
export function Leaderboard({ beatmapId, run, limit }: Props): JSX.Element | null {
  const t = useT();
  const [name, setName] = useState(loadNickname);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [status, setStatus] = useState<BoardStatus>('ok');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Read once per render: it only changes when this component posts.
  const me = playerId();

  useEffect(() => {
    if (!hasBoard(beatmapId)) return;
    let cancelled = false;
    setBusy(true);
    void fetchBoard(beatmapId, limit).then((page) => {
      if (cancelled) return;
      setEntries(page.entries);
      setStatus(page.status);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [beatmapId, limit]);

  if (!hasBoard(beatmapId)) return null;

  const clean = sanitizeNickname(name);

  const send = async (): Promise<void> => {
    if (!run || !clean || busy) return;
    setBusy(true);
    const page = await submitScore(beatmapId, clean, run, limit);
    // A refused name is an answer about the name, not about the board: keep
    // showing the rows already on screen and let the player pick another.
    if (page.status !== 'taken') setEntries(page.entries);
    setStatus(page.status);
    setSubmitted(page.status === 'ok');
    setBusy(false);
  };

  return (
    <section className={`board${run ? '' : ' board--glance'}`}>
      <h2 className="board-title">{t('board.title')}</h2>

      {status !== 'ok' && status !== 'not-configured' && (
        <p className="small chart-error">{t(STATUS_KEY[status])}</p>
      )}

      {entries.length > 0 && (
        <ol className="board-list">
          {entries.map((entry, i) => (
            <li
              key={entry.playerId}
              className={`board-row${entry.playerId === me ? ' board-row--mine' : ''}`}
            >
              <span className="board-rank">{i + 1}</span>
              <span className="board-name">
                {entry.name}
                {entry.playerId === me && <span className="board-you"> {t('board.you')}</span>}
              </span>
              <span className="board-score">{t.n(entry.score)}</span>
              <span className="board-detail">{entry.accuracy.toFixed(2)} %</span>
            </li>
          ))}
        </ol>
      )}

      {status === 'ok' && entries.length === 0 && !busy && (
        <p className="small">{t('board.empty')}</p>
      )}

      {run &&
        (submitted ? (
          <p className="small">{t('board.submitted')}</p>
        ) : (
          <>
            <div className="board-submit">
              <label className="board-field">
                {t('board.name')}
                <input
                  type="text"
                  value={name}
                  maxLength={NICKNAME_MAX}
                  placeholder={t('board.placeholder')}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="button--ghost"
                disabled={busy || clean.length === 0}
                onClick={() => void send()}
              >
                {busy ? t('board.sending') : t('board.submit')}
              </button>
            </div>
            <p className="small">{t('board.identity')}</p>
          </>
        ))}

      {/* Said on the screen, not only in the README: a board that looks
          authoritative and is not would be the dishonest version of this. */}
      {run && <p className="small">{t('board.unverified')}</p>}
    </section>
  );
}
