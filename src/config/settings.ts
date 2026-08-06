/**
 * EVERY TUNABLE IN THE GAME.
 *
 * This is the only file to touch to change how the game feels: pinch thresholds,
 * target size, timing windows, approach-ring speed, smoothing.
 *
 * Values are mutable at runtime from the browser console:
 *   window.fingertune.settings.PINCH_ON_RATIO = 0.35
 */

export interface Settings {
  /* ---- Pinch (hysteresis: two thresholds, so noise cannot flicker it) ----------
     ratio = distance(thumb[4], index[8]) / distance(wrist[0], middle MCP[9])
     Normalising by hand size makes the threshold independent of how far you sit
     from the webcam. */
  /** Below this ratio the pinch becomes ACTIVE. */
  PINCH_ON_RATIO: number;
  /** Above this ratio the pinch is RELEASED. Must stay > PINCH_ON_RATIO. */
  PINCH_OFF_RATIO: number;
  /** Minimum delay between two triggers (ms). Guards against double-fires. */
  PINCH_COOLDOWN_MS: number;

  /* ---- Targets ------------------------------------------------------------------ */
  /** Target radius, as a fraction of the playfield's smaller side. */
  TARGET_RADIUS: number;
  /** Hit tolerance = visual radius x this factor. */
  HIT_RADIUS_SCALE: number;
  /** Approach-ring duration before the hit instant, in seconds.
   *  Fallback only: each beatmap phase defines its own (BeatmapPhase.approachTime). */
  APPROACH_TIME: number;
  /** Initial approach-ring radius, in multiples of the target radius. */
  APPROACH_START: number;
  /** Target fade-in duration, in seconds. */
  FADE_IN: number;
  /** Inner margin of the playfield (fraction of its size), so no target hugs an edge. */
  PLAYFIELD_PADDING: number;

  /* ---- Sliders (hold the pinch and follow the ball) ------------------------------ */
  /** Follow-circle radius = target radius x this. Bigger than the head: once you
   *  are holding, the game should be generous about staying on the ball. */
  SLIDER_FOLLOW_SCALE: number;
  /** Seconds between two tick sounds while following. */
  SLIDER_TICK_INTERVAL: number;
  /** Followed fraction needed for a PERFECT on the slider body. */
  SLIDER_PERFECT_RATIO: number;
  /** Followed fraction needed for a GOOD. Below it, the body is a MISS. */
  SLIDER_GOOD_RATIO: number;

  /* ---- Timing windows (seconds, on |now - t|) ------------------------------------ */
  WINDOW_PERFECT: number;
  WINDOW_GOOD: number;

  /* ---- Score --------------------------------------------------------------------- */
  SCORE_PERFECT: number;
  SCORE_GOOD: number;
  /** Score bonus per combo point (0.02 = +2% per combo). */
  COMBO_BONUS: number;
  /** Combo value above which the bonus stops growing. */
  COMBO_CAP: number;

  /* ---- One-Euro filter (landmark smoothing) -------------------------------------
     Low MIN_CUTOFF = very smooth but sluggish. High BETA = more responsive to fast
     motion (less lag) at the cost of letting a little more jitter through. */
  OEF_MIN_CUTOFF: number;
  OEF_BETA: number;
  OEF_D_CUTOFF: number;

  /* ---- Hand tracking ------------------------------------------------------------- */
  /** Hands tracked. 1 by default; the whole pipeline already loops over N hands. */
  MAX_HANDS: number;
  MIN_DETECTION_CONF: number;
  MIN_PRESENCE_CONF: number;
  MIN_TRACKING_CONF: number;
  /** Seconds without a detection before a hand is forgotten. */
  HAND_LOST_TIMEOUT: number;

  /* ---- Misc ---------------------------------------------------------------------- */
  /** Draw the full hand skeleton (21 landmarks + bones). Key S. */
  SHOW_SKELETON: boolean;
  /** Live pinch gauge (ratio + thresholds), bottom right. Key P. */
  SHOW_PINCH_METER: boolean;
  /** Outline the playfield, so you can see where targets can appear. Key F. */
  SHOW_PLAYFIELD: boolean;
  /** Countdown before the first note, in seconds. */
  COUNTDOWN: number;
  /** Audible metronome (key M in game). */
  METRONOME_ON: boolean;
  /** Master volume, in dB. */
  MASTER_VOLUME: number;
  /** Volume of a custom music track (VITE_MUSIC_URL), in dB. */
  MUSIC_VOLUME: number;
  /** Tracking debug overlay (key D in game). */
  DEBUG: boolean;

  /* ---- Pause ------------------------------------------------------------ */
  /**
   * Seconds without a tracked hand before the run pauses itself.
   *
   * Losing the hand is not the same as playing badly: someone walks into frame,
   * you reach for a glass, the lighting shifts. Judging notes nobody could see
   * turns a run into a scoreboard of things that were never attempted.
   */
  AUTO_PAUSE_AFTER: number;
  /**
   * Seconds rewound when a run resumes.
   *
   * Coming back to a note already halfway under its approach ring is
   * unplayable. The run was interrupted, not failed, so it gives back the beat
   * it takes to read the screen again.
   */
  RESUME_REWIND: number;
}

export const settings: Settings = {
  PINCH_ON_RATIO: 0.45,
  PINCH_OFF_RATIO: 0.65,
  PINCH_COOLDOWN_MS: 140,

  TARGET_RADIUS: 0.075,
  HIT_RADIUS_SCALE: 1.35,
  APPROACH_TIME: 1.6,
  APPROACH_START: 3.2,
  FADE_IN: 0.25,
  PLAYFIELD_PADDING: 0.04,

  SLIDER_FOLLOW_SCALE: 2.2,
  SLIDER_TICK_INTERVAL: 0.22,
  SLIDER_PERFECT_RATIO: 0.85,
  SLIDER_GOOD_RATIO: 0.5,

  WINDOW_PERFECT: 0.06,
  WINDOW_GOOD: 0.12,

  SCORE_PERFECT: 300,
  SCORE_GOOD: 100,
  COMBO_BONUS: 0.02,
  COMBO_CAP: 50,

  OEF_MIN_CUTOFF: 1.7,
  OEF_BETA: 0.02,
  OEF_D_CUTOFF: 1.0,

  MAX_HANDS: 2,
  MIN_DETECTION_CONF: 0.5,
  MIN_PRESENCE_CONF: 0.5,
  MIN_TRACKING_CONF: 0.5,
  HAND_LOST_TIMEOUT: 0.5,

  SHOW_SKELETON: true,
  SHOW_PINCH_METER: true,
  SHOW_PLAYFIELD: false,
  COUNTDOWN: 3.0,
  METRONOME_ON: false,
  AUTO_PAUSE_AFTER: 1.5,
  RESUME_REWIND: 1.2,
  MASTER_VOLUME: -6,
  MUSIC_VOLUME: -8,
  DEBUG: false,
};

/**
 * Where the MediaPipe assets live.
 *
 * Defaults: wasm served from our own origin (copied by scripts/copy-assets.mjs),
 * model from Google's CDN. For a fully offline game: `npm run fetch:model`, then
 * put VITE_HAND_MODEL_URL=./models/hand_landmarker.task in .env.local
 */
export const assets = {
  wasmPath:
    import.meta.env.VITE_MEDIAPIPE_WASM_PATH ??
    `${import.meta.env.BASE_URL}mediapipe/wasm`,
  modelUrl:
    import.meta.env.VITE_HAND_MODEL_URL ??
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  /**
   * Music track. Empty by default: the soundtrack is GENERATED by Tone.js (no
   * asset, no licensing, and it follows the phases).
   * Drop a file in public/music/ and set
   *   VITE_MUSIC_URL=./music/my-track.mp3
   * in .env.local to play over it. Then align your beatmap's `t` values to it.
   */
  musicUrl: import.meta.env.VITE_MUSIC_URL,
} as const;

/** Grade colours, shared by the canvas and the HUD. */
export const GRADE_STYLE = {
  PERFECT: { label: 'PERFECT', color: '#4dd8ff', score: () => settings.SCORE_PERFECT, weight: 1.0 },
  GOOD: { label: 'GOOD', color: '#ffd24d', score: () => settings.SCORE_GOOD, weight: 0.34 },
  MISS: { label: 'MISS', color: '#ff5566', score: () => 0, weight: 0 },
} as const;
