/**
 * Is this device one the game can actually be played on?
 *
 * Most of the traffic to a link posted on LinkedIn or in a chat arrives on a
 * phone, and Fingertune cannot work on one: the camera is in the hand that is
 * supposed to be pinching, and the other hand is holding the screen. Letting a
 * phone through means the visitor grants camera access, sees their own face
 * fill the screen, cannot hit anything, and leaves believing the project is
 * broken rather than that it is for a desk.
 *
 * The test is deliberately conservative, and errs towards letting people in:
 *
 * - No `getUserMedia` at all is decisive. Nothing below can run.
 * - A coarse pointer *and* a small screen is the phone signature. Either alone
 *   is not: a touchscreen laptop has a coarse pointer and a 15-inch display, a
 *   small window on a desktop has a fine pointer.
 * - A tablet propped up on a stand is a perfectly good way to play, which is
 *   why the screen it leads to offers a way through rather than a wall.
 */
export function needsADesk(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return true;

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  // The short side, so the answer does not change when the phone is rotated.
  const shortSide = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0);
  return coarsePointer && shortSide > 0 && shortSide < 600;
}
