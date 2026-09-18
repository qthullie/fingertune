/**
 * The handful of settings a player chooses rather than a developer tunes.
 *
 * `config/settings.ts` holds what the game *is*; this holds what one person
 * decided about it on one machine. Privacy is the case that makes the
 * distinction matter: someone who hides the webcam image once has told you
 * something about where they play, and asking again on the next visit — after
 * the camera has already started and their room is already on screen — is
 * asking too late.
 *
 * Every accessor swallows its own failures. Storage throws in private windows
 * and when site data is blocked, and none of that is a reason to refuse to
 * start a game.
 */

const HIDE_VIDEO_KEY = 'fingertune.privacy.hideVideo';

export function loadHideVideo(): boolean {
  try {
    return localStorage.getItem(HIDE_VIDEO_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveHideVideo(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDE_VIDEO_KEY, '1');
    else localStorage.removeItem(HIDE_VIDEO_KEY);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
}
