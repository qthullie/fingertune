/**
 * Who is posting.
 *
 * A player is a Supabase anonymous account: no email, no password, created the
 * first time someone posts a score, and held by this browser as a signed token.
 * The name on the board belongs to that account, so nobody else can post under
 * it or raise its runs — the table checks the token, not a column the page
 * filled in (supabase/migrations/0002_players.sql).
 *
 * Reading a board never creates an account. Only posting does, so someone who
 * looks and leaves costs the project nothing.
 *
 * The honest limit: the identity is this browser's. Clear the site data and it
 * is gone, and its name with it.
 */

import { HttpError, call } from './supabase';

export const NICKNAME_MAX = 16;

const SESSION_KEY = 'fingertune.session';
const NICKNAME_KEY = 'fingertune.nickname';
/** Name the server has accepted, per account, so posting does not re-claim it. */
const CLAIMED_KEY = 'fingertune.claimed';

/** Refresh this long before expiry, so a token never dies mid-request. */
const REFRESH_MARGIN_S = 60;

interface Session {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  userId: string;
}

/* --------------------------------------------------------------- storage -- */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: the session lasts as long as the tab, which still works.
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.expiresAt === 'number' &&
    typeof v.userId === 'string'
  );
}

function loadSession(): Session | null {
  try {
    const parsed: unknown = JSON.parse(read(SESSION_KEY) ?? 'null');
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- session -- */

/** GoTrue's answer to a sign-up or a refresh, checked rather than cast. */
function toSession(payload: unknown): Session {
  const p = (payload ?? {}) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_at?: unknown;
    expires_in?: unknown;
    user?: { id?: unknown };
  };
  const expiresAt =
    typeof p.expires_at === 'number'
      ? p.expires_at
      : Math.floor(Date.now() / 1000) + (typeof p.expires_in === 'number' ? p.expires_in : 0);
  const session = {
    accessToken: p.access_token,
    refreshToken: p.refresh_token,
    expiresAt,
    userId: p.user?.id,
  };
  if (!isSession(session)) throw new Error('Unexpected answer from the auth server.');
  return session;
}

async function obtain(): Promise<Session> {
  const saved = loadSession();
  const now = Date.now() / 1000;
  if (saved && saved.expiresAt - REFRESH_MARGIN_S > now) return saved;

  if (saved) {
    try {
      const fresh = toSession(
        await call('auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: { refresh_token: saved.refreshToken },
        }),
      );
      write(SESSION_KEY, JSON.stringify(fresh));
      return fresh;
    } catch (err) {
      // Only a refusal means the account is out of reach. A network failure
      // must not mint a new one: that would orphan the player's name for the
      // sake of a dropped connection.
      if (!(err instanceof HttpError) || err.status >= 500) throw err;
    }
  }

  const created = toSession(await call('auth/v1/signup', { method: 'POST', body: {} }));
  write(SESSION_KEY, JSON.stringify(created));
  write(CLAIMED_KEY, null);
  return created;
}

let pending: Promise<Session> | null = null;

/**
 * A valid token, creating the anonymous account on first use. Concurrent
 * callers share one request: refresh tokens are single-use, and two refreshes
 * racing would leave one of them holding a revoked token.
 */
export function session(): Promise<Session> {
  pending ??= obtain().finally(() => {
    pending = null;
  });
  return pending;
}

/** This browser's player id, or null before its first post. Never hits the network. */
export function playerId(): string | null {
  return loadSession()?.userId ?? null;
}

/* ------------------------------------------------------------------ name -- */

/**
 * Cleans a nickname: trimmed, whitespace collapsed, length-capped, and stripped
 * of the characters that let one name impersonate another or break a line. The
 * table refuses the same set, so this is courtesy, not defence.
 */
export function sanitizeNickname(raw: string): string {
  let kept = '';
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    const invisible =
      code < 0x20 ||
      code === 0x7f ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x2069) ||
      code === 0xfeff;
    if (!invisible) kept += char;
  }
  return kept.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

export function loadNickname(): string {
  return sanitizeNickname(read(NICKNAME_KEY) ?? '');
}

export type ClaimResult = 'ok' | 'taken';

/**
 * Makes `name` this player's name, creating the player on first use. A rename
 * follows every score already posted, since the board reads names from here.
 *
 * Throws on a network or server failure; a name held by someone else is not a
 * failure but an answer, and comes back as 'taken'.
 */
export async function claimName(name: string): Promise<ClaimResult> {
  const clean = sanitizeNickname(name);
  const { accessToken, userId } = await session();

  write(NICKNAME_KEY, clean);
  if (read(CLAIMED_KEY) === `${userId}:${clean}`) return 'ok';

  try {
    await call('rest/v1/players?on_conflict=id', {
      method: 'POST',
      token: accessToken,
      // Insert on the first claim, rename on every later one: one request
      // either way, and no need to remember which case this is.
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { id: userId, name: clean },
    });
  } catch (err) {
    // 409: the case-insensitive unique index on names. Someone else has it.
    if (err instanceof HttpError && err.status === 409) return 'taken';
    throw err;
  }

  write(CLAIMED_KEY, `${userId}:${clean}`);
  return 'ok';
}
