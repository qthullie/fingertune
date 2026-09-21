/// <reference lib="webworker" />

/**
 * Hand inference, off the main thread.
 *
 * MediaPipe's `detectForVideo` is synchronous and takes 8-20 ms per frame on a
 * laptop. Called from the render loop, as it was, that time comes straight out
 * of the frame budget: at 60 fps there are 16.6 ms to spend, so a 12 ms
 * inference leaves 4 ms for the clock, the hit tests, the effects and the
 * canvas. The result is a game that renders at 60 fps when the hand is absent
 * and stutters the moment one appears — which is the only moment that matters.
 *
 * Here the model runs in a worker and the main thread only ever hands over an
 * ImageBitmap and takes back 21 points. The render loop keeps its whole budget.
 *
 * The honest cost: a result now arrives one hop later than the frame it
 * describes, so this trades jitter for a little more latency. That is the right
 * trade only because the latency is the part the game can compensate for —
 * see PREDICT_AHEAD — while a dropped frame is gone for good.
 *
 * The protocol is deliberately tiny, and `seq` is the whole of the flow
 * control: the main thread never sends a second frame while one is in flight,
 * so the worker cannot build a queue of stale images to grind through.
 */

import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface WorkerInit {
  type: 'init';
  wasmPath: string;
  modelUrl: string;
  numHands: number;
  minDetectionConfidence: number;
  minPresenceConfidence: number;
  minTrackingConfidence: number;
}

export interface WorkerFrame {
  type: 'frame';
  bitmap: ImageBitmap;
  /** performance.now() of the frame, which MediaPipe requires to be monotonic. */
  timestamp: number;
  seq: number;
}

export type WorkerRequest = WorkerInit | WorkerFrame;

export interface WorkerReady {
  type: 'ready';
}

export interface WorkerFailed {
  type: 'failed';
  message: string;
}

export interface WorkerResult {
  type: 'result';
  seq: number;
  landmarks: NormalizedLandmark[][];
  /** One entry per hand: 'Left', 'Right', or null when the model is unsure. */
  handedness: Array<'Left' | 'Right' | null>;
}

export type WorkerResponse = WorkerReady | WorkerFailed | WorkerResult;

const scope = self as unknown as DedicatedWorkerGlobalScope;

let landmarker: HandLandmarker | null = null;

async function init(message: WorkerInit): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks(message.wasmPath);
  landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: message.modelUrl, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: message.numHands,
    minHandDetectionConfidence: message.minDetectionConfidence,
    minHandPresenceConfidence: message.minPresenceConfidence,
    minTrackingConfidence: message.minTrackingConfidence,
  });
}

scope.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const message = event.data;

  if (message.type === 'init') {
    init(message).then(
      () => scope.postMessage({ type: 'ready' } satisfies WorkerResponse),
      (err: unknown) =>
        scope.postMessage({
          type: 'failed',
          message: err instanceof Error ? err.message : String(err),
        } satisfies WorkerResponse),
    );
    return;
  }

  // A frame that arrives before the model is ready, or after a failure, is
  // dropped rather than queued: it describes a moment that has already passed.
  if (!landmarker) {
    message.bitmap.close();
    return;
  }

  try {
    const result = landmarker.detectForVideo(message.bitmap, message.timestamp);
    scope.postMessage({
      type: 'result',
      seq: message.seq,
      landmarks: result.landmarks,
      handedness: result.handednesses.map((entry) => {
        const name = entry[0]?.categoryName;
        return name === 'Left' || name === 'Right' ? name : null;
      }),
    } satisfies WorkerResponse);
  } catch {
    // An invalid frame is not worth reporting: the next one recovers. But the
    // main thread is waiting on this `seq` before it sends another, so an empty
    // result has to go back or the pipeline stalls for good.
    scope.postMessage({
      type: 'result',
      seq: message.seq,
      landmarks: [],
      handedness: [],
    } satisfies WorkerResponse);
  } finally {
    message.bitmap.close();
  }
};
