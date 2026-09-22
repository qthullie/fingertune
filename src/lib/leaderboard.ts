/**
 * The online board: read the top of a chart, post a run to it.
 *
 * ## What this is honest about
 *
 * **Scores here are not verified and cannot be.** The game runs entirely in the
 * browser, so anything it sends is something the player could have typed. There
 * is no replay to check, no server-side simulation, and adding one would mean
 * running the whole judgement pipeline twice. So the board is a place to put a
 * number next to a name, not a ranked ladder, and the README says so where a
 * visitor will read it.
 *
 * What *is* defended: a name belongs to one player (see player.ts), nobody can
 * post as somebody else or touch their runs, and the table rejects impossible
 * rows. All of it in supabase/migrations, where the key cannot reach around it.
 *
 * **It is optional.** With no project configured the component renders nothing
 * and the game is exactly what it was. A missing backend is a working
 * configuration, not a degraded one.
 */

import { claimName, sanitizeNickname, session } from './player';
import { HttpError, call, isConfigured } from './supabase';

export { isConfigured };

const DEFAULT_LIMIT = 20;

export interface BoardEntry {
  playerId: string;
  name: string;
  score: number;
  accuracy: number;
  maxCombo: number;
}

export interface RunScore {
  score: number;
  accuracy: number;
  maxCombo: number;
}

/**
 * Why a board call did not return rows.
 *
 * A status rather than a thrown error: a leaderboard that cannot be reached is
 * not a reason to interrupt someone who has just finished a run, and each of
 * these deserves a different sentence on screen.
 */
export type BoardStatus = 'ok' | 'not-configured' | 'offline' | 'timeout' | 'rejected' | 'taken';

export interface BoardPage {
  entries: BoardEntry[];
  status: BoardStatus;
}

function classify(err: unknown): BoardStatus {
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  // 4xx is the server saying no — a malformed row, a policy refusing it, or
  // anonymous sign-ins switched off. Anything else is the network, and those
  // read very differently on screen.
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) return 'rejected';
  return 'offline';
}

interface Row {
  player_id?: unknown;
  score?: unknown;
  accuracy?: unknown;
  max_combo?: unknown;
  players?: { name?: unknown } | null;
}

/** Rows come from a public table: nothing in them is trusted until checked. */
function parseRows(payload: unknown): BoardEntry[] {
  if (!Array.isArray(payload)) return [];
  const entries: BoardEntry[] = [];
  for (const raw of payload as Row[]) {
    const score = Number(raw.score);
    const accuracy = Number(raw.accuracy);
    const maxCombo = Number(raw.max_combo);
    if (!Number.isFinite(score) || typeof raw.player_id !== 'string') continue;
    entries.push({
      playerId: raw.player_id,
      name: sanitizeNickname(String(raw.players?.name ?? '')) || 'anon',
      score: Math.max(0, Math.round(score)),
      accuracy: Number.isFinite(accuracy) ? Math.min(100, Math.max(0, accuracy)) : 0,
      maxCombo: Number.isFinite(maxCombo) ? Math.max(0, Math.round(maxCombo)) : 0,
    });
  }
  return entries;
}

/** Top scores for a chart. Read as anon: looking never creates an account. Never throws. */
export async function fetchBoard(beatmapId: string, limit = DEFAULT_LIMIT): Promise<BoardPage> {
  if (!isConfigured()) return { entries: [], status: 'not-configured' };
  try {
    const query = new URLSearchParams({
      beatmap: `eq.${beatmapId}`,
      // players(name) is PostgREST following the foreign key: the name comes
      // from the player, so a rename shows on every run they have posted.
      select: 'player_id,score,accuracy,max_combo,players(name)',
      order: 'score.desc',
      limit: String(limit),
    });
    const rows = await call(`rest/v1/scores?${query}`, { method: 'GET' });
    return { entries: parseRows(rows), status: 'ok' };
  } catch (err) {
    console.warn('[fingertune] leaderboard unreachable:', err);
    // "Refused this score" is only true of a post. A read the server turns
    // down — a migration not applied yet, say — is a board that is not there.
    const status = classify(err);
    return { entries: [], status: status === 'rejected' ? 'offline' : status };
  }
}

/**
 * Posts a run under `name`, then returns the board around it. Claims the name
 * first, so a name someone else holds stops here with 'taken' instead of
 * posting under whatever this player was called before. Never throws.
 */
export async function submitScore(
  beatmapId: string,
  name: string,
  run: RunScore,
  limit = DEFAULT_LIMIT,
): Promise<BoardPage> {
  if (!isConfigured()) return { entries: [], status: 'not-configured' };

  try {
    if ((await claimName(name)) === 'taken') return { entries: [], status: 'taken' };

    const { accessToken, userId } = await session();
    await call('rest/v1/scores', {
      method: 'POST',
      token: accessToken,
      // No row comes back: a worse run is cancelled by the table and a better
      // one replaces the old, so the only answer worth showing is the board
      // re-read straight afterwards.
      headers: { Prefer: 'return=minimal' },
      body: {
        beatmap: beatmapId,
        player_id: userId,
        score: Math.max(0, Math.round(run.score)),
        accuracy: Number(Math.min(100, Math.max(0, run.accuracy)).toFixed(2)),
        max_combo: Math.max(0, Math.round(run.maxCombo)),
      },
    });
  } catch (err) {
    console.warn('[fingertune] could not submit score:', err);
    return { entries: [], status: classify(err) };
  }

  return fetchBoard(beatmapId, limit);
}
