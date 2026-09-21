/**
 * Hand tracking: MediaPipe Hand Landmarker (Tasks Vision) plus the pinch state
 * machine.
 *
 * This module knows nothing about the game: it exposes `HandState` objects with
 * a normalised pinch position and a `justPinched` rising edge.
 *
 * Inference runs in a worker when the browser allows it (see handWorker.ts) and
 * inline otherwise. Both paths feed the same state machines through
 * `applyDetection`, so the game cannot tell which one it got.
 */

import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Point2DFilter } from './oneEuro';
import { assets, settings } from '../config/settings';
import type { Vec2 } from '../game/types';
import type { WorkerFrame, WorkerInit, WorkerResponse } from './handWorker';

/** The landmarks the decision uses (out of the 21 MediaPipe reports). */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
} as const;

/** Landmarks per hand in MediaPipe's model. */
export const LANDMARK_COUNT = 21;

/**
 * Skeleton bones: pairs of landmark indices to connect when drawing.
 * Palm, then thumb, index, middle, ring, pinky.
 */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // palm
  [0, 1],
  [0, 5],
  [5, 9],
  [9, 13],
  [13, 17],
  [0, 17],
  // thumb
  [1, 2],
  [2, 3],
  [3, 4],
  // index
  [5, 6],
  [6, 7],
  [7, 8],
  // middle
  [9, 10],
  [10, 11],
  [11, 12],
  // ring
  [13, 14],
  [14, 15],
  [15, 16],
  // pinky
  [17, 18],
  [18, 19],
  [19, 20],
];

/** Left / right hand as reported by MediaPipe. */
export type Handedness = 'Left' | 'Right';

/** Per-hand persistent state: smoothing filters plus the pinch state machine. */
export class HandState {
  /** The 21 smoothed landmarks, in mirrored image coordinates (0..1). Empty when lost. */
  landmarks: Vec2[] = [];
  /** Smoothed thumb tip, in mirrored image coordinates (0..1). */
  thumb: Vec2 | null = null;
  /** Smoothed index tip. */
  index: Vec2 | null = null;
  /** Game cursor: midpoint of thumb and index. */
  pinchPos: Vec2 | null = null;
  /** Current pinch ratio (thumb-index distance over hand size). */
  ratio = 1;
  /** Current hysteresis state. */
  pinching = false;
  /** True for ONE frame, on the released -> active transition. */
  justPinched = false;
  /** Is this hand currently tracked? */
  visible = false;
  /** Left / right per MediaPipe (used to keep a stable slot). */
  handedness: Handedness | null = null;

  /** One 2D One-Euro filter per landmark: the whole skeleton is smoothed. */
  private readonly filters: Point2DFilter[] = Array.from(
    { length: LANDMARK_COUNT },
    () => new Point2DFilter(settings.OEF_MIN_CUTOFF, settings.OEF_BETA, settings.OEF_D_CUTOFF),
  );
  private lastTriggerMs = Number.NEGATIVE_INFINITY;
  private lastSeen = Number.NEGATIVE_INFINITY;

  constructor(readonly id: number) {}

  /**
   * @param landmarks the hand's 21 landmarks
   * @param tSec smoothing clock (seconds)
   * @param nowMs cooldown clock (milliseconds)
   */
  update(
    landmarks: NormalizedLandmark[],
    tSec: number,
    nowMs: number,
    handedness: Handedness | null = null,
  ): void {
    // The video is displayed mirrored (otherwise the game is unplayable), so the
    // landmarks are mirrored too and everything downstream shares one space.
    const smoothed: Vec2[] = [];
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const raw = landmarks[i];
      const filter = this.filters[i];
      if (!raw || !filter) return;
      smoothed.push(
        filter.filter(1 - raw.x, raw.y, tSec, settings.PREDICT_AHEAD, settings.PREDICT_MAX_STEP),
      );
    }

    const thumb = smoothed[LM.THUMB_TIP];
    const index = smoothed[LM.INDEX_TIP];
    const wrist = smoothed[LM.WRIST];
    const middle = smoothed[LM.MIDDLE_MCP];
    if (!thumb || !index || !wrist || !middle) return;

    this.landmarks = smoothed;
    this.handedness = handedness;
    this.thumb = thumb;
    this.index = index;
    this.pinchPos = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };

    // Normalising by hand size (wrist -> middle-finger base) makes the threshold
    // independent of the distance to the webcam.
    const pinchDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    const handSize = Math.hypot(wrist.x - middle.x, wrist.y - middle.y);
    this.ratio = handSize > 1e-4 ? pinchDistance / handSize : 1;

    // Hysteresis: two separate thresholds, plus a cooldown against double-fires.
    this.justPinched = false;
    if (!this.pinching && this.ratio < settings.PINCH_ON_RATIO) {
      this.pinching = true;
      if (nowMs - this.lastTriggerMs > settings.PINCH_COOLDOWN_MS) {
        this.justPinched = true;
        this.lastTriggerMs = nowMs;
      }
    } else if (this.pinching && this.ratio > settings.PINCH_OFF_RATIO) {
      this.pinching = false;
    }

    this.lastSeen = tSec;
    this.visible = true;
  }

  /** Hand absent from this frame: kept briefly, then forgotten. */
  markMissing(tSec: number): void {
    this.justPinched = false;
    if (tSec - this.lastSeen > settings.HAND_LOST_TIMEOUT) {
      this.visible = false;
      this.pinching = false;
      this.landmarks = [];
      this.handedness = null;
    }
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
    this.landmarks = [];
    this.handedness = null;
    this.pinching = false;
    this.justPinched = false;
    this.visible = false;
    this.lastTriggerMs = Number.NEGATIVE_INFINITY;
    this.lastSeen = Number.NEGATIVE_INFINITY;
  }
}

/**
 * Which slow step the loader is on.
 *
 * A step, not a sentence: this module has no business holding English. The UI
 * turns it into `status.runtime` / `status.model` / `status.camera` in whatever
 * language the player is reading.
 */
export type LoadingStep = 'runtime' | 'model' | 'camera';

/** Errors surfaced to the UI so it can show a clear message. */
export class TrackingError extends Error {
  constructor(
    readonly code: 'NO_MEDIA_DEVICES' | 'MODEL_LOAD_FAILED' | 'CAMERA_FAILED',
    message: string,
    readonly sourceError?: unknown,
  ) {
    super(message);
    this.name = 'TrackingError';
  }
}

/** One model output, whichever side of the thread boundary produced it. */
interface Detection {
  landmarks: NormalizedLandmark[][];
  handedness: Array<Handedness | null>;
}

/**
 * Spawns the inference worker and resolves once its model is loaded.
 *
 * It rejects rather than resolving into a half-working state, so the caller can
 * fall back to inline inference — slower, but never silently broken.
 */
function startWorker(options: Omit<WorkerInit, 'type'>): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./handWorker.ts', import.meta.url), { type: 'module' });

    const cleanup = (): void => {
      worker.removeEventListener('message', onMessage as EventListener);
      worker.removeEventListener('error', onError as EventListener);
    };
    const onMessage = (event: MessageEvent<WorkerResponse>): void => {
      if (event.data.type === 'ready') {
        cleanup();
        resolve(worker);
      } else if (event.data.type === 'failed') {
        cleanup();
        worker.terminate();
        reject(new Error(event.data.message));
      }
    };
    const onError = (event: ErrorEvent): void => {
      cleanup();
      worker.terminate();
      reject(new Error(event.message || 'worker failed to start'));
    };

    worker.addEventListener('message', onMessage as EventListener);
    worker.addEventListener('error', onError as EventListener);
    worker.postMessage({ type: 'init', ...options } satisfies WorkerInit);
  });
}

export class HandTracker {
  readonly hands: HandState[] = [];
  video: HTMLVideoElement | null = null;

  /**
   * Where inference happens.
   *
   * The worker is the fast path and the only one that keeps the render loop at
   * 60 fps. `inline` is the fallback for a browser without module workers or
   * `createImageBitmap`, and for a worker that fails to start — a game that
   * runs badly is worth more than a game that refuses to run.
   */
  private worker: Worker | null = null;
  private inline: HandLandmarker | null = null;

  /** True while a frame is with the worker. This is the whole flow control. */
  private pending = false;
  private seq = 0;
  private latest: Detection | null = null;
  private stream: MediaStream | null = null;
  private lastVideoTime = -1;

  get modelReady(): boolean {
    return this.worker !== null || this.inline !== null;
  }

  get cameraReady(): boolean {
    return this.video !== null && this.video.videoWidth > 0;
  }

  /** True when inference is running off the main thread. */
  get threaded(): boolean {
    return this.worker !== null;
  }

  /** Loads the wasm runtime and the model. Idempotent. */
  async loadModel(onProgress?: (step: LoadingStep) => void): Promise<void> {
    if (this.modelReady) return;

    onProgress?.('runtime');
    const options = {
      wasmPath: assets.wasmPath,
      modelUrl: assets.modelUrl,
      numHands: settings.MAX_HANDS,
      minDetectionConfidence: settings.MIN_DETECTION_CONF,
      minPresenceConfidence: settings.MIN_PRESENCE_CONF,
      minTrackingConfidence: settings.MIN_TRACKING_CONF,
    };

    onProgress?.('model');
    if (settings.THREADED_INFERENCE && typeof createImageBitmap === 'function') {
      try {
        this.worker = await startWorker(options);
      } catch (err) {
        // Falling back rather than failing: a worker can be blocked by a COEP
        // header, by an extension, or by a browser without module workers, and
        // none of that is a reason to refuse to run.
        console.warn('[fingertune] inference worker unavailable, running inline:', err);
        this.worker = null;
      }
    }

    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>): void => {
        const message = event.data;
        if (message.type !== 'result') return;
        this.pending = false;
        this.latest = { landmarks: message.landmarks, handedness: message.handedness };
      };
    } else {
      try {
        const fileset = await FilesetResolver.forVisionTasks(assets.wasmPath);
        this.inline = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: assets.modelUrl, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: options.numHands,
          minHandDetectionConfidence: options.minDetectionConfidence,
          minHandPresenceConfidence: options.minPresenceConfidence,
          minTrackingConfidence: options.minTrackingConfidence,
        });
      } catch (err) {
        throw new TrackingError('MODEL_LOAD_FAILED', 'Could not load the hand model', err);
      }
    }

    for (let i = this.hands.length; i < settings.MAX_HANDS; i++) {
      this.hands.push(new HandState(i));
    }
  }

  /** Requests the webcam and starts the stream. Idempotent. */
  async startCamera(onProgress?: (step: LoadingStep) => void): Promise<HTMLVideoElement> {
    if (this.video && this.cameraReady) return this.video;

    onProgress?.('camera');
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new TrackingError('NO_MEDIA_DEVICES', 'Webcam API unavailable (insecure context?)');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = this.stream;
    await video.play();

    // Some browsers report 0x0 for the first few frames.
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (video.videoWidth > 0) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });

    this.video = video;
    return video;
  }

  /**
   * Advances tracking by one render frame.
   *
   * Two halves that do not wait for each other, which is the whole point of the
   * worker: results are applied whenever they turn up, frames are submitted
   * whenever the camera has a new one. A slow inference then slows the tracking
   * without ever slowing the drawing.
   *
   * @param tSec game clock (for smoothing)
   * @param nowMs performance.now() (timestamp MediaPipe requires)
   */
  detect(tSec: number, nowMs: number): void {
    const video = this.video;
    if (!video || video.videoWidth === 0) return;

    // `justPinched` is a rising edge, valid for ONE render frame. The webcam runs
    // at ~30 fps against a 60 fps loop: without this clear, the flag would still
    // be standing next frame and one pinch would trigger two hits.
    for (const hand of this.hands) hand.justPinched = false;

    // 1. Whatever the worker finished since the last frame.
    if (this.latest) {
      const { landmarks, handedness } = this.latest;
      this.latest = null;
      this.applyDetection(landmarks, handedness, tSec, nowMs);
    }

    // 2. A new camera frame, if there is one and the pipeline is free.
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    if (this.worker) {
      // Still chewing: skip this frame rather than queue it. A queue here would
      // mean the model works through images the player has already moved past.
      if (this.pending) return;
      this.pending = true;
      const seq = ++this.seq;
      void createImageBitmap(video).then(
        (bitmap) => {
          const frame: WorkerFrame = { type: 'frame', bitmap, timestamp: nowMs, seq };
          this.worker?.postMessage(frame, [bitmap]);
        },
        () => {
          this.pending = false;
        },
      );
      return;
    }

    if (!this.inline) return;
    try {
      const result = this.inline.detectForVideo(video, nowMs);
      this.applyDetection(result.landmarks, readHandedness(result.handednesses), tSec, nowMs);
    } catch {
      // invalid frame: skip it, the next one recovers
    }
  }

  /**
   * Feeds one detection into the per-hand state machines.
   *
   * Stable slot assignment: the left hand keeps slot 0, the right one slot 1.
   * Without this, MediaPipe can swap detection order between frames and the
   * smoothing filters would jump from one hand to the other.
   */
  private applyDetection(
    landmarks: NormalizedLandmark[][],
    handedness: Array<Handedness | null>,
    tSec: number,
    nowMs: number,
  ): void {
    const assigned = new Map<number, { lm: NormalizedLandmark[]; handedness: Handedness | null }>();
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm) continue;
      const side = handedness[i] ?? null;

      let slot = this.hands.length > 1 && side === 'Right' ? 1 : 0;
      if (assigned.has(slot)) {
        // Collision (same handedness twice, or a single tracked hand): take the
        // first free slot instead.
        slot = this.hands.findIndex((_, index) => !assigned.has(index));
        if (slot < 0) continue;
      }
      assigned.set(slot, { lm, handedness: side });
    }

    for (let i = 0; i < this.hands.length; i++) {
      const hand = this.hands[i];
      if (!hand) continue;
      const detection = assigned.get(i);
      if (detection) hand.update(detection.lm, tSec, nowMs, detection.handedness);
      else hand.markMissing(tSec);
    }
  }

  get anyHandVisible(): boolean {
    return this.hands.some((hand) => hand.visible);
  }

  /** Number of hands currently tracked. */
  get visibleHandCount(): number {
    return this.hands.reduce((n, hand) => n + (hand.visible ? 1 : 0), 0);
  }

  resetHands(): void {
    for (const hand of this.hands) hand.reset();
  }

  /** Releases the webcam and the worker (useful when tearing the app down). */
  dispose(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video = null;
    this.worker?.terminate();
    this.worker = null;
    this.inline?.close();
    this.inline = null;
    this.latest = null;
    this.pending = false;
    this.lastVideoTime = -1;
  }
}

/** MediaPipe's per-hand category list, reduced to the side or nothing. */
function readHandedness(
  categories: Array<Array<{ categoryName: string }>>,
): Array<Handedness | null> {
  return categories.map((entry) => {
    const name = entry[0]?.categoryName;
    return name === 'Left' || name === 'Right' ? name : null;
  });
}
