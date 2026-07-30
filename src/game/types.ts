/** Shared game types. */

export type Grade = 'PERFECT' | 'GOOD' | 'MISS';

export type GamePhase = 'idle' | 'playing' | 'finished';

/** A beatmap note. x and y are normalised 0..1 inside the playfield. */
export interface BeatmapNote {
  /** 0 = left edge of the playfield (already mirrored), 1 = right edge. */
  x: number;
  /** 0 = top, 1 = bottom. */
  y: number;
  /** Hit instant, in seconds from the start of the track. */
  t: number;
}

/**
 * A difficulty phase. A beatmap chains several: the first one is very slow and
 * very forgiving, later ones tighten the ring, the windows and the targets.
 */
export interface BeatmapPhase {
  id: string;
  /** Shown as a banner when the phase starts. */
  name: string;
  /** Short subtitle: what the phase asks of the player. */
  hint: string;
  /** Phase start, in beatmap seconds (before the countdown offset). */
  start: number;
  /** Approach-ring duration for this phase's notes, in seconds. */
  approachTime: number;
  /**
   * Multiplier on the timing windows (Perfect / Good). 2 = twice as forgiving.
   * This makes as much of the difficulty as the speed does.
   */
  hitWindowScale: number;
  /** Multiplier on target radius (and therefore on spatial tolerance). */
  targetScale: number;
}

export interface Beatmap {
  id: string;
  title: string;
  author: string;
  bpm: number;
  /** Sorted by ascending `start`. The first one must start at 0. */
  phases: BeatmapPhase[];
  notes: BeatmapNote[];
}

/** A note instantiated for a run. */
export interface Target extends BeatmapNote {
  id: number;
  hit: boolean;
  dead: boolean;
  grade: Grade | null;
  /** Approach-ring duration, inherited from the note's phase. */
  approach: number;
  /** Effective timing windows (seconds), inherited from the phase. */
  perfectWindow: number;
  goodWindow: number;
  /** Effective radius (fraction of the playfield's smaller side). */
  radius: number;
  phaseIndex: number;
}

/** A normalised 2D point. */
export interface Vec2 {
  x: number;
  y: number;
}

/** State React reads (immutable, replaced whenever something changes). */
export interface GameSnapshot {
  phase: GamePhase;
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  counts: Record<Grade, number>;
  lastGrade: Grade | null;
  /** Increasing id of the last judgement: used as a `key` to replay an animation. */
  lastEventId: number;
  /** Signed timing error of the last hit, in ms (negative = early). */
  lastOffsetMs: number;
  /** Game time, rounded (refreshed ~20x/s so the HUD does not rerender at 60 fps). */
  time: number;
  duration: number;
  /** At least one hand is being tracked. */
  handVisible: boolean;
  /** Number of hands currently tracked. */
  handCount: number;
  /** Current beatmap phase. */
  phaseIndex: number;
  phaseCount: number;
  phaseName: string;
  phaseHint: string;
  /** Increments on every phase change: used as a `key` for the banner. */
  phaseEventId: number;
}
