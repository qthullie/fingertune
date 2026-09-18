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

  /* ---- Latency compensation ------------------------------------------------------
     The pipeline reports where the hand WAS: the camera exposes a frame, ships
     it, the model runs, and only then does the game hear about it. On a laptop
     that round trip is 40-80 ms, and in a game judged to the millisecond the
     cursor therefore trails the hand by a visible amount. */
  /**
   * Seconds to project the hand forward along its own velocity. 0 disables it.
   *
   * Dead reckoning: the One-Euro filter already keeps a smoothed derivative to
   * choose its cutoff, and that estimate is reused here rather than computing a
   * second one that would disagree with it.
   *
   * Tune it against your own machine, not against a number: press D, watch the
   * reported offset on your hits. Consistently late means raise this;
   * consistently early means lower it. Past ~0.12 the cursor starts leading the
   * hand badly enough to feel possessed.
   */
  PREDICT_AHEAD: number;
  /**
   * Ceiling on a single frame's extrapolation, in normalised image units.
   *
   * Prediction fails in exactly one place: the instant the hand reverses. The
   * velocity still points the old way, so the cursor is flung further in the
   * wrong direction than the lag it was correcting. Capping the step bounds that
   * error to something smaller than a target.
   */
  PREDICT_MAX_STEP: number;

  /**
   * Run MediaPipe in a Web Worker instead of on the render thread.
   *
   * `detectForVideo` is synchronous and costs 8-20 ms. Called from the render
   * loop it eats most of a 60 fps frame budget, which is why the game used to
   * be smooth until a hand appeared — the only moment that matters.
   *
   * Off by way of a flag rather than unconditionally, because the worker can be
   * blocked by a COEP header or an extension; the tracker falls back to inline
   * inference on its own when that happens, and `HandTracker.threaded` reports
   * which path is live (press D).
   *
   * The trade is honest: a result arrives one hop later than the frame it
   * describes. That is worth it only because latency is the part the game can
   * compensate for — see PREDICT_AHEAD — while a dropped frame is gone.
   */
  THREADED_INFERENCE: boolean;

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
  /**
   * Draw the webcam image. Key V.
   *
   * The symmetric of SHOW_SKELETON, and the more useful half of the pair. Off,
   * the frame is never painted: what is left is the skeleton, the targets and
   * the gauge on flat paper. Nobody sees the room behind you.
   *
   * This is a feature, not a workaround. Streamers need it, anyone recording a
   * clip in a shared flat needs it, and a demo at a conference needs it. It
   * also happens to be the better picture — a hand drawn in two colours over
   * white reads at a glance, which a blurred living room never does.
   *
   * The tracking is untouched: MediaPipe still receives every frame. Only the
   * `drawImage` is skipped, so hiding the video costs nothing and, on a weak
   * laptop, gives a frame or two back.
   */
  SHOW_VIDEO: boolean;
  /**
   * Screen pixels per rendered pixel. 1 renders the playfield smooth.
   *
   * Above 1, the canvas is drawn into a buffer this many times smaller than the
   * window and blown back up with `image-rendering: pixelated`. Nothing in the
   * drawing code knows about it: every coordinate, the hit tests included,
   * lives in that space, so the game is identical and only the grain changes.
   *
   * It defaults to 1, and the reason is the thing you aim at. The pixel art is
   * the logo and the interface around it; a target is a circle, and a circle
   * quantised onto a coarse grid has to be interpreted before it can be hit —
   * which is a cost paid in the one place the game asks for precision. At 3 the
   * approach ring, the mark the player is actually timing against, loses its
   * edge entirely.
   *
   * 2 and 3 are there for anyone who wants the whole screen blocky, and every
   * line width scales with it (see `unit()` in render/renderer.ts) so nothing
   * turns into a slab.
   */
  PIXEL_SCALE: number;
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

  THREADED_INFERENCE: true,

  PREDICT_AHEAD: 0.045,
  PREDICT_MAX_STEP: 0.06,

  MAX_HANDS: 2,
  MIN_DETECTION_CONF: 0.5,
  MIN_PRESENCE_CONF: 0.5,
  MIN_TRACKING_CONF: 0.5,
  HAND_LOST_TIMEOUT: 0.5,

  SHOW_SKELETON: true,
  SHOW_VIDEO: true,
  PIXEL_SCALE: 1,
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

/**
 * The whole palette, in one place, mirrored by the custom properties in
 * styles.css.
 *
 * Two colours, and they are the logo's own: `#ff5edb` and `#4dd8ff`, exactly as
 * they appear in assets/logo.svg. Not a darker magenta for text and a brighter
 * one for fills — one magenta. A page carrying four near-misses of the same hue
 * reads as a page that could not decide, and it stops looking like its own icon.
 *
 * Which means one rule, and everything below follows from it: **colour is never
 * text**. `#4dd8ff` on white is about 1.5:1, so a cyan word is a decoration
 * someone has to squint at. Colour is a fill with ink on top of it, or a stroke
 * on the canvas thick enough to be a shape. Ink carries the words.
 *
 * `red` is the one exception and is not a brand colour: it marks failure — a
 * miss, an error, being behind the score you are chasing — and it is chosen to
 * sit clearly apart from the magenta so the two are never confused.
 *
 * There are no gradients anywhere, on canvas or in CSS. A gradient is a
 * continuum, and pixel art is a set of decisions about which of a handful of
 * colours each square gets.
 */
export const PALETTE = {
  /** Page and canvas background. */
  paper: '#ffffff',
  /** Panels and inactive tracks, one step off the paper. */
  paperShade: '#f4f4f8',
  /** Hairlines and dividers. */
  rule: '#d9d9e3',
  /** Everything that is a word, plus borders and skeleton bones. */
  ink: '#16162a',
  /** Secondary text. Ink, lightened — not a colour. */
  inkSoft: '#61617a',
  /** The logo's magenta. The approach ring, a held pinch, the primary action. */
  pink: '#ff5edb',
  /** The logo's cyan. The target, the first hand, progress, PERFECT. */
  cyan: '#4dd8ff',
  /** Failure only, and deliberately far from the magenta. */
  red: '#e5484d',
} as const;

export type GradeName = 'PERFECT' | 'GOOD' | 'MISS';

/** Grade colours, shared by the canvas and the HUD. */
export const GRADE_STYLE = {
  PERFECT: {
    label: 'PERFECT',
    /** Filled cyan behind ink, never cyan lettering. */
    color: PALETTE.cyan,
    score: () => settings.SCORE_PERFECT,
    weight: 1.0,
  },
  /* GOOD gets no colour at all. It is the middle judgement, and giving it a
     third hue would mean inventing one; being the unmarked case is what tells
     the player they neither nailed it nor lost it. */
  GOOD: { label: 'GOOD', color: PALETTE.ink, score: () => settings.SCORE_GOOD, weight: 0.34 },
  MISS: { label: 'MISS', color: PALETTE.red, score: () => 0, weight: 0 },
} as const;

/**
 * The fill behind a grade label, or `undefined` for the one that has none.
 *
 * Grades are blocks of colour with the word in ink on top, never coloured
 * lettering: ink on cyan is 8:1, cyan on white is 2.2:1, and it is the same
 * colour either way round. GOOD's "colour" is the ink itself, which means it
 * gets no fill — being the unmarked case is what tells the player they neither
 * nailed it nor lost it.
 */
export function gradeFill(grade: GradeName): string | undefined {
  const { color } = GRADE_STYLE[grade];
  return color === PALETTE.ink ? undefined : color;
}
