/**
 * Best scores, one per beatmap, persisted in localStorage.
 *
 * Deliberately local: no account, no server, nothing leaving the machine — like
 * the rest of the game. Every read and write is guarded: localStorage can throw
 * in private mode, and a lost score must never break a run.
 */

const STORAGE_KEY = 'fingertune.highscores.v1';

export interface BestScore {
  score: number;
  /** Weighted accuracy, as a percentage. */
  accuracy: number;
  maxCombo: number;
  /** ISO date of the record. */
  date: string;
}

export interface RecordResult {
  /** Did the run that just ended beat the previous record? */
  isRecord: boolean;
  /** Previous record, or null if this was the first run. */
  previous: BestScore | null;
  /** Best score after this run. */
  best: BestScore;
}

type Store = Record<string, BestScore>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota full or storage denied: play on without saving.
  }
}

/** Best known score for a beatmap, or null. */
export function loadBest(beatmapId: string): BestScore | null {
  const entry = readStore()[beatmapId];
  if (!entry || typeof entry.score !== 'number') return null;
  return entry;
}

/**
 * Saves a run if it beats the record. Score wins; on a tie, the better accuracy
 * wins.
 */
export function submitScore(beatmapId: string, run: Omit<BestScore, 'date'>): RecordResult {
  const store = readStore();
  const previous = store[beatmapId] ?? null;
  const isRecord =
    !previous ||
    run.score > previous.score ||
    (run.score === previous.score && run.accuracy > previous.accuracy);

  if (!isRecord) return { isRecord: false, previous, best: previous };

  const best: BestScore = { ...run, date: new Date().toISOString() };
  store[beatmapId] = best;
  writeStore(store);
  return { isRecord: true, previous, best };
}
