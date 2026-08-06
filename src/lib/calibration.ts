/**
 * Personal pinch thresholds, measured instead of assumed.
 *
 * The shipped defaults (0.45 / 0.65) are a compromise that suits nobody in
 * particular. The ratio is `distance(thumb, index) / distance(wrist, middle
 * MCP)`, which removes the distance to the camera but not the hand itself:
 * finger length against palm width varies enough between people that a
 * threshold comfortable for one hand is unreachable for another. A player whose
 * closed pinch bottoms out at 0.5 can pinch as hard as they like and the game
 * will never see it.
 *
 * So the start screen asks for three pinches and reads the two ends of the
 * range off the player's own hand. That is the whole feature: it replaces a
 * paragraph of instructions telling the player to go and tune a threshold they
 * have no way to reason about.
 */

export interface CalibrationResult {
  /** Lowest ratio seen while pinching. */
  closed: number;
  /** Highest ratio seen with the hand open. */
  open: number;
  onRatio: number;
  offRatio: number;
}

/** Ratios below this are noise, not a hand: a lost hand reports 1 by default. */
const MIN_PLAUSIBLE = 0.02;

/**
 * Turns a recorded sweep of ratios into a pair of thresholds.
 *
 * The two are placed inside the measured range rather than at its ends. `on`
 * sits low so a half-hearted pinch does not fire; `off` sits high so the hand
 * has to genuinely reopen before the next one counts. The gap between them is
 * the hysteresis, and it is what stops a ratio hovering near the boundary from
 * flickering the pinch — so it is enforced as a floor even on a narrow range.
 *
 * @returns null when the samples do not describe an open-and-close at all,
 *          which is the honest answer: better to keep the defaults than to
 *          write thresholds derived from someone holding still.
 */
export function computeThresholds(samples: readonly number[]): CalibrationResult | null {
  const usable = samples.filter((r) => Number.isFinite(r) && r > MIN_PLAUSIBLE);
  if (usable.length < 20) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  // 10th / 90th percentile rather than min and max: one bad frame at either end
  // would otherwise set the whole scale.
  const closed = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0] ?? 0;
  const open = sorted[Math.floor(sorted.length * 0.9)] ?? sorted.at(-1) ?? 1;

  const span = open - closed;
  // A hand that never really opened or never really closed. Refusing is more
  // useful than inventing a threshold from it.
  if (span < 0.12) return null;

  const onRatio = closed + span * 0.35;
  const offRatio = Math.max(closed + span * 0.65, onRatio + 0.08);

  return { closed, open, onRatio, offRatio };
}


/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/*                                                                            */
/* A hand does not change between sessions, so neither should the thresholds.  */
/* Asking for the same six seconds on every visit would turn a fix into a toll.*/
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = 'fingertune.calibration.v1';

interface StoredCalibration {
  onRatio: number;
  offRatio: number;
}

/** Every read and write is guarded: localStorage throws in private mode. */
export function saveCalibration(value: StoredCalibration): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Not being able to remember is not a reason to fail the run. */
  }
}

export function loadCalibration(): StoredCalibration | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCalibration>;
    const { onRatio, offRatio } = parsed;
    // Reject anything that would make the pinch impossible to trigger or
    // impossible to release: a corrupt entry must not brick the game.
    if (typeof onRatio !== 'number' || typeof offRatio !== 'number') return null;
    if (!(onRatio > 0 && offRatio > onRatio && offRatio < 2)) return null;
    return { onRatio, offRatio };
  } catch {
    return null;
  }
}

export function clearCalibration(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
