/**
 * Challenge links: a score to beat, carried in the URL.
 *
 * `#c=<beatmapId>.<score>` and nothing else. No account, no server, no
 * database — the whole feature is a string in a fragment, which means it costs
 * nothing to run and keeps working for as long as the page does.
 *
 * The fragment, not the query string: it never reaches the server, so a shared
 * link leaks a score and a map id to exactly the person it was sent to.
 *
 * There is no attempt to make this tamper-proof. Anyone can type a bigger
 * number into their own URL bar, and if they do, they have beaten themselves at
 * a game nobody was refereeing. Signing it would cost a backend to defend
 * against an attack whose only victim is the attacker.
 */

export interface Challenge {
  beatmapId: string;
  score: number;
}

const PREFIX = '#c=';

/** Reads a challenge out of a URL fragment, or null if there is none. */
export function parseChallenge(hash: string): Challenge | null {
  if (!hash.startsWith(PREFIX)) return null;
  const raw = decodeURIComponent(hash.slice(PREFIX.length));
  // Map ids have no dots, so the last one separates id from score.
  const split = raw.lastIndexOf('.');
  if (split <= 0) return null;

  const beatmapId = raw.slice(0, split);
  const score = Number(raw.slice(split + 1));
  if (!beatmapId || !Number.isFinite(score) || score < 0) return null;

  return { beatmapId, score: Math.floor(score) };
}

/** Absolute URL that opens the game on `beatmapId` with `score` to beat. */
export function buildChallengeUrl(beatmapId: string, score: number): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}${PREFIX}${encodeURIComponent(`${beatmapId}.${Math.floor(score)}`)}`;
}

/**
 * Copies text, with a fallback for browsers that refuse the async clipboard.
 *
 * `navigator.clipboard` needs a secure context and a permission that can be
 * denied outright; the hidden-textarea route is ugly but it is what still works
 * when that happens. Failing to copy silently would leave the button looking
 * like it did nothing.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
