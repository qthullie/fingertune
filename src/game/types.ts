/** Shared game types. */

export type Grade = 'PERFECT' | 'GOOD' | 'MISS';

export type GamePhase = 'idle' | 'playing' | 'paused' | 'finished';

/**
 * What a note asks for.
 *  - `circle`: pinch once, on the beat.
 *  - `slider`: pinch on the head, then HOLD the pinch and follow the ball along
 *    the path, in the direction it travels, until the end.
 */
export type NoteKind = 'circle' | 'slider' | 'hazard';

/** A beatmap note. x and y are normalised 0..1 inside the playfield. */
export interface BeatmapNote {
  /** 0 = left edge of the playfield (already mirrored), 1 = right edge. */
  x: number;
  /** 0 = top, 1 = bottom. */
  y: number;
  /** Hit instant, in seconds from the start of the track. For a slider: its head. */
  t: number;
  /** Defaults to 'circle'. */
  kind?: NoteKind;
  /**
   * Slider path, as a polyline in playfield coordinates. The head (x, y) is
   * implicit as the first point; list the rest here. The ball reaches the last
   * point at t + duration.
   */
  path?: ReadonlyArray<Vec2>;
  /** Slider travel time, in seconds. */
  duration?: number;
  /**
   * On a night sky, starts a new constellation here instead of linking this
   * star to the one before it (see render/sky.ts). Purely visual.
   */
  newFigure?: boolean;
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
  /** Optional CSS colour for this phase's note disc. Defaults to PALETTE.cyan. */
  color?: string;
  /**
   * Plays the phase over the looping psychedelic video, whose colours jump on
   * every hit. A map with any such phase also turns the interface rainbow.
   */
  psychedelic?: boolean;
  /**
   * Flame walls closing in from both sides: how far each one reaches by the end
   * of the phase, as a fraction of the camera area's width. They grow steadily
   * from the previous phase's value, and touching them restarts the run.
   */
  fire?: number;
  /** Plays the phase on a night sky instead of paper (see `Sky`). */
  sky?: Sky;
}

/**
 * A night sky behind a phase: stars, light, and the constellations the player's
 * hits draw. Purely visual -- nothing here changes what is judged or how.
 */
export interface Sky {
  /** Background colour. Consecutive skies cross-fade into each other. */
  color: string;
  /**
   * Stars rushing out from the centre, from 0 (drifting) to 1 (full warp).
   * Climbs steadily from the previous phase's value across the phase, the
   * way `fire` does, so a build-up is a phase that ends at 1.
   */
  warp?: number;
  /** How hard the sky breathes on each beat, 0..1. */
  pulse?: number;
  /** Light rays turning slowly behind the playfield. */
  rays?: boolean;
}

/** The generated soundtracks a beatmap can name (see lib/soundtracks.ts). */
export type SoundtrackId = 'groove' | 'constellation';

export interface Beatmap {
  id: string;
  title: string;
  author: string;
  bpm: number;
  /** Which generated track plays under the map. Defaults to 'groove'. */
  soundtrack?: SoundtrackId;
  /** Sorted by ascending `start`. The first one must start at 0. */
  phases: BeatmapPhase[];
  notes: BeatmapNote[];
}

/** How a slider is doing, once its head has been hit. */
export type SliderState =
  /** Head not hit yet. */
  | 'pending'
  /** Head hit, the pinch is being held on the ball. */
  | 'holding'
  /** The pinch was released or drifted off the ball; can be picked back up. */
  | 'dropped'
  /** Finished (judged). */
  | 'done';

/** A note instantiated for a run. */
export interface Target extends BeatmapNote {
  id: number;
  kind: NoteKind;
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
  /** Phase accent colour, if the phase defines one. */
  color?: string;

  /* ---- Sliders only ---------------------------------------------------- */
  /** Full polyline, head included, in playfield coordinates. */
  points: Vec2[];
  /** Cumulative length of each point along the path (normalised units). */
  cumulative: number[];
  /** Total path length. */
  pathLength: number;
  /** Travel time in seconds (0 for a circle). */
  duration: number;
  sliderState: SliderState;
  /** Seconds the ball was actually followed. */
  heldTime: number;
  /** Game time of the last tick sound. */
  lastTickAt: number;
  /** True once the hold was lost at least once (a slider break). */
  broke: boolean;
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
  /** True when the pause was triggered by losing the hand, not by the player. */
  autoPaused: boolean;
  /** Number of hands currently tracked. */
  handCount: number;
  /** Current beatmap phase. */
  phaseIndex: number;
  phaseCount: number;
  /** Phase id, so the UI can look up a translation for the name and hint. */
  phaseId: string;
  phaseName: string;
  phaseHint: string;
  /** Increments on every phase change: used as a `key` for the banner. */
  phaseEventId: number;
  /** True if the run ended because the player touched a fire zone. */
  failed: boolean;
  /** The current phase is played on a night sky, so the HUD has to read on dark. */
  night: boolean;
}
