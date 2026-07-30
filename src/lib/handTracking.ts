/**
 * Hand tracking : MediaPipe Hand Landmarker (Tasks Vision) + machine a etats du
 * pincement.
 *
 * Le module ne connait rien au jeu : il expose des `HandState` avec une position
 * de pincement normalisee et un evenement `justPinched` (front montant).
 */

import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Point2DFilter } from './oneEuro';
import { assets, settings } from '../config/settings';
import type { Vec2 } from '../game/types';

/** Index des landmarks utilises (sur les 21 fournis par MediaPipe). */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
} as const;

/** Etat persistant d'une main : filtres de lissage + hysteresis du pincement. */
export class HandState {
  /** Bout du pouce, lisse, en coordonnees image miroir (0..1). */
  thumb: Vec2 | null = null;
  /** Bout de l'index, lisse. */
  index: Vec2 | null = null;
  /** Curseur de jeu : milieu pouce/index. */
  pinchPos: Vec2 | null = null;
  /** Ratio de pincement courant (distance pouce-index / taille de main). */
  ratio = 1;
  /** Etat courant de l'hysteresis. */
  pinching = false;
  /** Vrai pendant UNE frame, sur la transition relache -> actif. */
  justPinched = false;
  /** La main est-elle suivie en ce moment ? */
  visible = false;

  private readonly thumbFilter: Point2DFilter;
  private readonly indexFilter: Point2DFilter;
  private lastTriggerMs = Number.NEGATIVE_INFINITY;
  private lastSeen = Number.NEGATIVE_INFINITY;

  constructor(readonly id: number) {
    this.thumbFilter = new Point2DFilter(
      settings.OEF_MIN_CUTOFF,
      settings.OEF_BETA,
      settings.OEF_D_CUTOFF,
    );
    this.indexFilter = new Point2DFilter(
      settings.OEF_MIN_CUTOFF,
      settings.OEF_BETA,
      settings.OEF_D_CUTOFF,
    );
  }

  /**
   * @param landmarks les 21 landmarks de la main
   * @param tSec horloge de lissage (secondes)
   * @param nowMs horloge du cooldown (millisecondes)
   */
  update(landmarks: NormalizedLandmark[], tSec: number, nowMs: number): void {
    const rawThumb = landmarks[LM.THUMB_TIP];
    const rawIndex = landmarks[LM.INDEX_TIP];
    const rawWrist = landmarks[LM.WRIST];
    const rawMiddle = landmarks[LM.MIDDLE_MCP];
    if (!rawThumb || !rawIndex || !rawWrist || !rawMiddle) return;

    // La video est affichee en miroir horizontal (sinon injouable) : on miroite
    // les landmarks pour rester dans le meme repere que le rendu.
    const mx = (p: NormalizedLandmark): number => 1 - p.x;

    this.thumb = this.thumbFilter.filter(mx(rawThumb), rawThumb.y, tSec);
    this.index = this.indexFilter.filter(mx(rawIndex), rawIndex.y, tSec);
    this.pinchPos = {
      x: (this.thumb.x + this.index.x) / 2,
      y: (this.thumb.y + this.index.y) / 2,
    };

    // Ratio normalise par la taille de la main (poignet -> base du majeur) :
    // rend le seuil independant de la distance a la webcam.
    const dPinch = Math.hypot(this.thumb.x - this.index.x, this.thumb.y - this.index.y);
    const dHand = Math.hypot(mx(rawWrist) - mx(rawMiddle), rawWrist.y - rawMiddle.y);
    this.ratio = dHand > 1e-4 ? dPinch / dHand : 1;

    // Hysteresis : deux seuils distincts, plus un cooldown anti double-trigger.
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

  /** Main absente de cette frame : on la garde un instant, puis on l'oublie. */
  markMissing(tSec: number): void {
    this.justPinched = false;
    if (tSec - this.lastSeen > settings.HAND_LOST_TIMEOUT) {
      this.visible = false;
      this.pinching = false;
    }
  }

  reset(): void {
    this.thumbFilter.reset();
    this.indexFilter.reset();
    this.pinching = false;
    this.justPinched = false;
    this.visible = false;
    this.lastTriggerMs = Number.NEGATIVE_INFINITY;
    this.lastSeen = Number.NEGATIVE_INFINITY;
  }
}

/** Erreurs remontees a l'UI pour affichage d'un message clair. */
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

  /** Charge le wasm + le modele. Idempotent. */
  async loadModel(onProgress?: (msg: string) => void): Promise<void> {
    if (this.landmarker) return;
    try {
      onProgress?.('Chargement du moteur de vision…');
      const fileset = await FilesetResolver.forVisionTasks(assets.wasmPath);

      onProgress?.('Chargement du modele de mains…');
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: assets.modelUrl, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: settings.MAX_HANDS,
        minHandDetectionConfidence: settings.MIN_DETECTION_CONF,
        minHandPresenceConfidence: settings.MIN_PRESENCE_CONF,
        minTrackingConfidence: settings.MIN_TRACKING_CONF,
      });
    } catch (err) {
      throw new TrackingError('MODEL_LOAD_FAILED', 'Chargement du modele impossible', err);
    }

    for (let i = this.hands.length; i < settings.MAX_HANDS; i++) {
      this.hands.push(new HandState(i));
    }
  }

  /** Demande la webcam et demarre le flux. Idempotent. */
  async startCamera(onProgress?: (msg: string) => void): Promise<HTMLVideoElement> {
    if (this.video && this.cameraReady) return this.video;

    onProgress?.('Demande d\'acces a la webcam…');
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new TrackingError(
        'NO_MEDIA_DEVICES',
        'API webcam indisponible (contexte non securise ?)',
      );
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

    // Certains navigateurs renvoient 0x0 pendant quelques frames.
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
   * Detection sur la frame video courante. A appeler une fois par frame de rendu ;
   * saute automatiquement si la webcam n'a pas produit de nouvelle image.
   *
   * @param tSec horloge de jeu (pour le lissage)
   * @param nowMs performance.now() (timestamp exige par MediaPipe)
   */
  detect(tSec: number, nowMs: number): void {
    const video = this.video;
    if (!video || !this.landmarker || video.videoWidth === 0) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    let landmarks: NormalizedLandmark[][] = [];
    try {
      landmarks = this.landmarker.detectForVideo(video, nowMs).landmarks;
    } catch {
      return; // frame invalide : on saute, la suivante repartira
    }

    for (let i = 0; i < this.hands.length; i++) {
      const hand = this.hands[i];
      if (!hand) continue;
      const lm = landmarks[i];
      if (lm) hand.update(lm, tSec, nowMs);
      else hand.markMissing(tSec);
    }
  }

  get anyHandVisible(): boolean {
    return this.hands.some((h) => h.visible);
  }

  resetHands(): void {
    for (const h of this.hands) h.reset();
  }

  /** Libere la webcam (utile au demontage du composant). */
  dispose(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}
