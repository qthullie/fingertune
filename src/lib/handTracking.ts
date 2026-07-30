/**
 * Hand tracking: MediaPipe Hand Landmarker (Tasks Vision) plus the pinch state
 * machine.
 *
 * This module knows nothing about the game: it exposes `HandState` objects with
 * a normalised pinch position and a `justPinched` rising edge.
 */

import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Point2DFilter } from './oneEuro';
import { assets, settings } from '../config/settings';
import type { Vec2 } from '../game/types';

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
      smoothed.push(filter.filter(1 - raw.x, raw.y, tSec));
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

export class HandTracker {
  readonly hands: HandState[] = [];
  video: HTMLVideoElement | null = null;

  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private lastVideoTime = -1;

  get modelReady(): boolean {
    return this.landmarker !== null;
  }

  get cameraReady(): boolean {
    return this.video !== null && this.video.videoWidth > 0;
  }

  /** Loads the wasm runtime and the model. Idempotent. */
  async loadModel(onProgress?: (message: string) => void): Promise<void> {
    if (this.landmarker) return;
    try {
      onProgress?.('Loading the vision runtime…');
      const fileset = await FilesetResolver.forVisionTasks(assets.wasmPath);

      onProgress?.('Loading the hand model…');
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: assets.modelUrl, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: settings.MAX_HANDS,
        minHandDetectionConfidence: settings.MIN_DETECTION_CONF,
        minHandPresenceConfidence: settings.MIN_PRESENCE_CONF,
        minTrackingConfidence: settings.MIN_TRACKING_CONF,
      });
    } catch (err) {
      throw new TrackingError('MODEL_LOAD_FAILED', 'Could not load the hand model', err);
    }

    for (let i = this.hands.length; i < settings.MAX_HANDS; i++) {
      this.hands.push(new HandState(i));
    }
  }

  /** Requests the webcam and starts the stream. Idempotent. */
  async startCamera(onProgress?: (message: string) => void): Promise<HTMLVideoElement> {
    if (this.video && this.cameraReady) return this.video;

    onProgress?.('Requesting webcam access…');
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
   * Runs detection on the current video frame. Call once per render frame; it
   * skips automatically when the webcam has not produced a new image.
   *
   * @param tSec game clock (for smoothing)
   * @param nowMs performance.now() (timestamp MediaPipe requires)
   */
  detect(tSec: number, nowMs: number): void {
    const video = this.video;
    if (!video || !this.landmarker || video.videoWidth === 0) return;

    // `justPinched` is a rising edge, valid for ONE render frame. The webcam runs
    // at ~30 fps against a 60 fps loop: without this clear, the flag would still
    // be standing next frame and one pinch would trigger two hits.
    for (const hand of this.hands) hand.justPinched = false;

    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    let landmarks: NormalizedLandmark[][] = [];
    let handednesses: Array<Array<{ categoryName: string }>> = [];
    try {
      const result = this.landmarker.detectForVideo(video, nowMs);
      landmarks = result.landmarks;
      handednesses = result.handednesses;
    } catch {
      return; // invalid frame: skip it, the next one recovers
    }

    // Stable slot assignment: the left hand keeps slot 0, the right one slot 1.
    // Without this, MediaPipe can swap detection order between frames and the
    // smoothing filters would jump from one hand to the other.
    const assigned = new Map<number, { lm: NormalizedLandmark[]; handedness: Handedness | null }>();
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm) continue;
      const raw = handednesses[i]?.[0]?.categoryName;
      const handedness: Handedness | null = raw === 'Left' || raw === 'Right' ? raw : null;

      let slot = this.hands.length > 1 && handedness === 'Right' ? 1 : 0;
      if (assigned.has(slot)) {
        // Collision (same handedness twice, or a single tracked hand): take the
        // first free slot instead.
        slot = this.hands.findIndex((_, index) => !assigned.has(index));
        if (slot < 0) continue;
      }
      assigned.set(slot, { lm, handedness });
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

  /** Releases the webcam (useful when tearing the app down). */
  dispose(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}
