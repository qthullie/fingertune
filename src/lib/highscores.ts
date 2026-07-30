/**
 * Meilleurs scores, un par beatmap, persistes dans localStorage.
 *
 * Volontairement local : pas de compte, pas de serveur, rien qui sorte de la
 * machine — comme le reste du jeu. Toutes les lectures/ecritures sont protegees :
 * en navigation privee, localStorage peut lever, et un score perdu ne doit jamais
 * casser une partie.
 */

const STORAGE_KEY = 'fingertune.highscores.v1';

export interface BestScore {
  score: number;
  /** Precision ponderee, en pourcents. */
  accuracy: number;
  maxCombo: number;
  /** Date ISO du record. */
  date: string;
}

export interface RecordResult {
  /** Le score qui vient d'etre joue bat-il l'ancien record ? */
  isRecord: boolean;
  /** Record precedent, ou null si c'etait la premiere partie. */
  previous: BestScore | null;
  /** Meilleur score apres cette partie. */
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
    // Quota plein ou stockage refuse : on joue sans sauvegarder.
  }
}

/** Meilleur score connu pour une beatmap, ou null. */
export function loadBest(beatmapId: string): BestScore | null {
  const entry = readStore()[beatmapId];
  if (!entry || typeof entry.score !== 'number') return null;
  return entry;
}

/**
 * Enregistre une partie si elle bat le record. Le score prime ; a score egal,
 * la meilleure precision l'emporte.
 */
export function submitScore(
  beatmapId: string,
  run: Omit<BestScore, 'date'>,
): RecordResult {
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

/** Efface le record d'une beatmap (utile depuis la console). */
export function clearBest(beatmapId: string): void {
  const store = readStore();
  delete store[beatmapId];
  writeStore(store);
}
