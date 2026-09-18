import { useEffect, useState } from 'react';
import {
  NICKNAME_MAX,
  fetchBoard,
  isConfigured,
  loadNickname,
  sanitizeNickname,
  saveNickname,
  submitScore,
  type BoardEntry,
  type BoardStatus,
  type RunScore,
} from '../lib/leaderboard';
import { useT, type MessageKey } from '../lib/i18n';

interface Props {
  beatmapId: string;
  /** The run that just finished, offered for submission. */
  run: RunScore;
}

const STATUS_KEY: Record<Exclude<BoardStatus, 'ok' | 'not-configured'>, MessageKey> = {
  offline: 'board.offline',
  timeout: 'board.timeout',
  rejected: 'board.rejected',
};

/**
 * The online board, on the end screen.
 *
 * Three things it does deliberately.
 *
 * It renders nothing at all when no board is configured. The game shipped
 * without one and still works without one, so an empty panel saying "no
 * leaderboard" would be a feature advertising its own absence.
 *
 * It loads the board before anything is submitted, so the run can be read
 * against the field without joining it. Posting a score is a choice, and it
 * asks for a name first — the whole point of the board is the name.
 *
 * It never blocks the end screen. Every failure mode comes back as a status and
 * becomes one sentence; a leaderboard that cannot be reached is not a reason to
 * interrupt someone who has just finished a run.
 */
export function Leaderboard({ beatmapId, run }: Props): JSX.Element | null {
  const t = useT();
  const [name, setName] = useState(loadNickname);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [status, setStatus] = useState<BoardStatus>('ok');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isConfigured()) return;
    let cancelled = false;
    setBusy(true);
    void fetchBoard(beatmapId).then((page) => {
      if (cancelled) return;
      setEntries(page.entries);
      setStatus(page.status);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [beatmapId]);

  if (!isConfigured()) return null;

  const clean = sanitizeNickname(name);

  const send = async (): Promise<void> => {
    if (!clean || busy) return;
    setBusy(true);
    saveNickname(clean);
    const page = await submitScore(beatmapId, clean, run);
    setEntries(page.entries);
    setStatus(page.status);
    setSubmitted(page.status === 'ok');
    setBusy(false);
  };

  return (
    <section className="board">
      <h2 className="board-title">{t('board.title')}</h2>

      {status !== 'ok' && status !== 'not-configured' && (
        <p className="small chart-error">{t(STATUS_KEY[status])}</p>
      )}

      {entries.length > 0 && (
        <ol className="board-list">
          {entries.map((entry, i) => (
            <li key={`${entry.name}-${i}`} className="board-row">
              <span className="board-rank">{i + 1}</span>
              <span className="board-name">{entry.name}</span>
              <span className="board-score">{t.n(entry.score)}</span>
              <span className="board-detail">{entry.accuracy.toFixed(2)} %</span>
            </li>
          ))}
        </ol>
      )}

      {status === 'ok' && entries.length === 0 && !busy && (
        <p className="small">{t('board.empty')}</p>
      )}

      {submitted ? (
        <p className="small">{t('board.submitted')}</p>
      ) : (
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
      )}

      {/* Said on the screen, not only in the README: a board that looks
          authoritative and is not would be the dishonest version of this. */}
      <p className="small">{t('board.unverified')}</p>
    </section>
  );
}
