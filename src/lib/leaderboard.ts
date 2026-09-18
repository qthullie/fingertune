/**
 * The online board: submit a run, read the top of a chart.
 *
 * Supabase over plain `fetch`, with no SDK. The client library is ~40 KB to do
 * two HTTP calls against PostgREST, and this file is the two calls.
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
 * What *is* defended, because it is cheap: the table rejects impossible rows
 * (see supabase/migrations), the key is publishable by design and row-level
 * security is what actually constrains it, and nothing here can read or write
 * anything but this one table.
 *
 * **It is optional.** With no URL configured, `isConfigured()` is false, the
 * end screen shows local scores only, and the game is exactly what it was. A
 * missing backend is a working configuration, not a degraded one.
 *
 * ## Configuration
 *
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, in .env.local. Both end up in
 * the built bundle — that is what "anon key" means — which is why the SQL
 * migration is the security boundary and not these values.
 */

const TIMEOUT_MS = 6000;
const DEFAULT_LIMIT = 20;

export const NICKNAME_MAX = 16;
const NICKNAME_KEY = 'fingertune.nickname';

const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** True when a board is configured. Everything else no-ops when it is false. */
export function isConfigured(): boolean {
  return url.length > 0 && anonKey.length > 0;
}

export interface BoardEntry {
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
export type BoardStatus = 'ok' | 'not-configured' | 'offline' | 'timeout' | 'rejected';

export interface BoardPage {
  entries: BoardEntry[];
  status: BoardStatus;
}

/* --------------------------------------------------------------- nicknames -- */

/**
 * Cleans a nickname: trimmed, whitespace collapsed, length-capped, and stripped
 * of the characters that let one name impersonate another or break a line.
 */
export function sanitizeNickname(raw: string): string {
  let kept = '';
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    // Control characters, zero-width marks and bidi overrides. Each one either
    // breaks the line it is rendered on or lets one name display as another,
    // and a leaderboard is exactly where somebody would try that.
    const invisible =
      code < 0x20 ||
      code === 0x7f ||
      (code >= 0x200b && code <= 0x200f) ||
      code === 0x2028 ||
      code === 0x2029;
    if (!invisible) kept += char;
  }
  return kept.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

export function loadNickname(): string {
  try {
    return sanitizeNickname(localStorage.getItem(NICKNAME_KEY) ?? '');
  } catch {
    return '';
  }
}

export function saveNickname(name: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, sanitizeNickname(name));
  } catch {
    // Private mode: the name lasts for this session, which is enough.
  }
}

/* ------------------------------------------------------------------ client -- */

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: headers(init.headers as Record<string, string> | undefined),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new HttpError(response.status, await response.text().catch(() => ''));
    }
    return response.status === 204 ? null : await response.json();
  } finally {
    clearTimeout(timer);
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'HttpError';
  }
}

function classify(err: unknown): BoardStatus {
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  // 4xx is the table saying no — a malformed row, or a policy refusing it.
  // Anything else is the network, and those read very differently on screen.
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) return 'rejected';
  return 'offline';
}

interface Row {
  name?: unknown;
  score?: unknown;
  accuracy?: unknown;
  max_combo?: unknown;
}

/** Rows come from a public table: nothing in them is trusted until checked. */
function parseRows(payload: unknown): BoardEntry[] {
  if (!Array.isArray(payload)) return [];
  const entries: BoardEntry[] = [];
  for (const raw of payload as Row[]) {
    const score = Number(raw.score);
    const accuracy = Number(raw.accuracy);
    const maxCombo = Number(raw.max_combo);
    if (!Number.isFinite(score)) continue;
    entries.push({
      name: sanitizeNickname(String(raw.name ?? '')) || 'anon',
      score: Math.max(0, Math.round(score)),
      accuracy: Number.isFinite(accuracy) ? Math.min(100, Math.max(0, accuracy)) : 0,
      maxCombo: Number.isFinite(maxCombo) ? Math.max(0, Math.round(maxCombo)) : 0,
    });
  }
  return entries;
}

/** Top scores for a chart. Never throws: failures come back as a status. */
export async function fetchBoard(beatmapId: string, limit = DEFAULT_LIMIT): Promise<BoardPage> {
  if (!isConfigured()) return { entries: [], status: 'not-configured' };
  try {
    const query = new URLSearchParams({
      beatmap: `eq.${beatmapId}`,
      select: 'name,score,accuracy,max_combo',
      order: 'score.desc',
      limit: String(limit),
    });
    return { entries: parseRows(await request(`scores?${query}`, { method: 'GET' })), status: 'ok' };
  } catch (err) {
    console.warn('[fingertune] leaderboard unreachable:', err);
    return { entries: [], status: classify(err) };
  }
}

/** Posts a run, then returns the board around it. Never throws. */
export async function submitScore(
  beatmapId: string,
  name: string,
  run: RunScore,
  limit = DEFAULT_LIMIT,
): Promise<BoardPage> {
  if (!isConfigured()) return { entries: [], status: 'not-configured' };

  const row = {
    beatmap: beatmapId,
    name: sanitizeNickname(name) || 'anon',
    score: Math.max(0, Math.round(run.score)),
    accuracy: Number(Math.min(100, Math.max(0, run.accuracy)).toFixed(2)),
    max_combo: Math.max(0, Math.round(run.maxCombo)),
  };

  try {
    await request('scores', {
      method: 'POST',
      // No row comes back: the board is read straight afterwards anyway, and
      // asking for the representation would return the caller's own row, which
      // tells them nothing they did not just send.
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (err) {
    console.warn('[fingertune] could not submit score:', err);
    return { entries: [], status: classify(err) };
  }

  return fetchBoard(beatmapId, limit);
}
