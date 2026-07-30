/**
 * TOUS LES REGLAGES DU JEU.
 *
 * C'est le seul fichier a toucher pour calibrer le feeling : seuils de pincement,
 * taille des cibles, fenetres de timing, vitesse du cercle d'approche, lissage.
 *
 * Les valeurs sont mutables a chaud depuis la console du navigateur :
 *   window.fingertune.settings.PINCH_ON_RATIO = 0.35
 */

export interface Settings {
  /* ---- Pincement (hysteresis : deux seuils, evite le clignotement) ---------------
     ratio = distance(pouce[4], index[8]) / distance(poignet[0], base majeur[9])
     Normalise par la taille de la main => robuste a l'eloignement de la webcam. */
  /** En dessous de ce ratio, le pincement passe ACTIF. */
  PINCH_ON_RATIO: number;
  /** Au dessus de ce ratio, le pincement repasse RELACHE. Doit rester > PINCH_ON_RATIO. */
  PINCH_OFF_RATIO: number;
  /** Delai minimum entre deux declenchements (ms), anti double-trigger. */
  PINCH_COOLDOWN_MS: number;

  /* ---- Cibles -------------------------------------------------------------------- */
  /** Rayon de la cible, en fraction du plus petit cote de la zone video affichee. */
  TARGET_RADIUS: number;
  /** Tolerance spatiale du hit = rayon visuel x ce facteur. */
  HIT_RADIUS_SCALE: number;
  /** Duree (s) du cercle d'approche. Valeur de repli : chaque phase de beatmap
   *  definit la sienne (voir BeatmapPhase.approachTime). */
  APPROACH_TIME: number;
  /** Rayon initial du cercle d'approche, en multiples du rayon cible. */
  APPROACH_START: number;
  /** Duree (s) du fondu d'apparition de la cible. */
  FADE_IN: number;

  /* ---- Fenetres de timing (secondes, sur |now - t|) ------------------------------- */
  WINDOW_PERFECT: number;
  WINDOW_GOOD: number;

  /* ---- Score ---------------------------------------------------------------------- */
  SCORE_PERFECT: number;
  SCORE_GOOD: number;
  /** Bonus de score par point de combo (0.02 = +2 % par combo). */
  COMBO_BONUS: number;
  /** Plafond du combo pris en compte dans le bonus. */
  COMBO_CAP: number;

  /* ---- Filtre One-Euro (lissage des landmarks) -----------------------------------
     MIN_CUTOFF bas = tres lisse mais mou. BETA haut = plus reactif aux mouvements
     rapides (moins de lag) mais laisse passer un peu plus de bruit. */
  OEF_MIN_CUTOFF: number;
  OEF_BETA: number;
  OEF_D_CUTOFF: number;

  /* ---- Hand tracking -------------------------------------------------------------- */
  /** Nombre de mains suivies. 2 = jeu a deux mains (les accords l'exigent). */
  MAX_HANDS: number;
  MIN_DETECTION_CONF: number;
  MIN_PRESENCE_CONF: number;
  MIN_TRACKING_CONF: number;
  /** Secondes sans detection avant d'oublier une main. */
  HAND_LOST_TIMEOUT: number;

  /* ---- Divers --------------------------------------------------------------------- */
  /** Dessine le squelette complet de la main (21 landmarks + connexions). Touche S. */
  SHOW_SKELETON: boolean;
  /** Jauge de pincement (ratio + seuils) en bas a droite. Touche P. */
  SHOW_PINCH_METER: boolean;
  /** Duree (s) d'affichage de la banniere de phase. */
  PHASE_BANNER_DURATION: number;
  /** Decompte (s) avant la premiere note. */
  COUNTDOWN: number;
  /** Metronome audible (touche M en jeu). */
  METRONOME_ON: boolean;
  /** Volume general en dB. */
  MASTER_VOLUME: number;
  /** Volume de la musique perso (VITE_MUSIC_URL) en dB. */
  MUSIC_VOLUME: number;
  /** Overlay de debug tracking (touche D en jeu). */
  DEBUG: boolean;
}

export const settings: Settings = {
  PINCH_ON_RATIO: 0.45,
  PINCH_OFF_RATIO: 0.65,
  PINCH_COOLDOWN_MS: 140,

  TARGET_RADIUS: 0.075,
  HIT_RADIUS_SCALE: 1.35,
  APPROACH_TIME: 1.1,
  APPROACH_START: 3.2,
  FADE_IN: 0.25,

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
  PHASE_BANNER_DURATION: 3.0,
  COUNTDOWN: 3.0,
  METRONOME_ON: false,
  MASTER_VOLUME: -6,
  MUSIC_VOLUME: -8,
  DEBUG: false,
};

/**
 * Emplacement des assets MediaPipe.
 *
 * Par defaut : wasm servi depuis notre propre origine (copie par
 * scripts/copy-mediapipe-assets.mjs), modele depuis le CDN Google.
 * Pour un jeu 100 % hors ligne : `npm run fetch:model` puis, dans .env.local
 *   VITE_HAND_MODEL_URL=./models/hand_landmarker.task
 */
export const assets = {
  wasmPath:
    import.meta.env.VITE_MEDIAPIPE_WASM_PATH ??
    `${import.meta.env.BASE_URL}mediapipe/wasm`,
  modelUrl:
    import.meta.env.VITE_HAND_MODEL_URL ??
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  /**
   * Musique du morceau. Vide par defaut : la piste est GENEREE par Tone.js
   * (aucun asset, aucun droit a gerer, et elle suit les phases).
   * Depose ton fichier dans public/music/ et mets
   *   VITE_MUSIC_URL=./music/mon-morceau.mp3
   * dans .env.local pour jouer dessus. Cale alors les `t` de ta beatmap sur lui.
   */
  musicUrl: import.meta.env.VITE_MUSIC_URL,
} as const;

/** Couleurs des grades, partagees par le canvas et le HUD. */
export const GRADE_STYLE = {
  PERFECT: { label: 'PERFECT', color: '#4dd8ff', score: () => settings.SCORE_PERFECT, weight: 1.0 },
  GOOD: { label: 'GOOD', color: '#ffd24d', score: () => settings.SCORE_GOOD, weight: 0.34 },
  MISS: { label: 'MISS', color: '#ff5566', score: () => 0, weight: 0 },
} as const;
