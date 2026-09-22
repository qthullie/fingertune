/**
 * The one door to Supabase: configuration and a `fetch` wrapper.
 *
 * No SDK. The client library is ~40 KB to make a handful of HTTP calls against
 * PostgREST and GoTrue, and this file is those calls' common part: the key,
 * a timeout, and errors that keep their status code.
 *
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, in .env.local. Both end up in
 * the built bundle — that is what "anon key" means — which is why the SQL in
 * supabase/migrations is the security boundary and not these values.
 */

const TIMEOUT_MS = 6000;

const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** True when a project is configured. Everything online no-ops when it is false. */
export function isConfigured(): boolean {
  return url.length > 0 && anonKey.length > 0;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'HttpError';
  }
}

interface CallInit {
  method: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  /** A player's access token. Without one the call is made as `anon`. */
  token?: string;
}

/**
 * One request against the project, `path` relative to its root
 * (`rest/v1/...`, `auth/v1/...`). Throws on anything but a 2xx.
 */
export async function call(path: string, init: CallInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/${path}`, {
      method: init.method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${init.token ?? anonKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      body: init.body === undefined ? null : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new HttpError(response.status, await response.text().catch(() => ''));
    }
    const text = await response.text();
    return text.trim() ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}
