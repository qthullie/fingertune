/** Types partages du jeu. */

export type Grade = 'PERFECT' | 'GOOD' | 'MISS';

export type GamePhase = 'idle' | 'playing' | 'finished';

/** Une note de beatmap. x, y sont normalises 0..1 dans la zone video affichee. */
export interface BeatmapNote {
  /** 0 = bord gauche de l'image affichee (deja en miroir), 1 = bord droit. */
  x: number;
  /** 0 = haut, 1 = bas. */
  y: number;
  /** Instant du hit, en secondes depuis le debut du morceau. */
  t: number;
}

/**
 * Une phase de difficulte. Une beatmap en enchaine plusieurs : la premiere est
 * tres lente (le temps de lire la cible et de caler son pincement), les
 * suivantes resserrent le cercle d'approche.
 */
export interface BeatmapPhase {
  id: string;
  /** Affiche en banniere au debut de la phase. */
  name: string;
  /** Sous-titre court (ce que la phase demande au joueur). */
  hint: string;
  /** Debut de la phase, en secondes de beatmap (avant le decompte). */
  start: number;
  /** Duree du cercle d'approche pour les notes de cette phase, en secondes. */
  approachTime: number;
  /**
   * Multiplicateur des fenetres de timing (Perfect / Good). 2 = deux fois plus
   * indulgent. C'est ce qui fait la difference facile / moyen / difficile,
   * autant que la vitesse.
   */
  hitWindowScale: number;
  /** Multiplicateur du rayon des cibles (et donc de la tolerance spatiale). */
  targetScale: number;
}

export interface Beatmap {
  id: string;
  title: string;
  author: string;
  bpm: number;
  /** Triees par `start` croissant. La premiere doit demarrer a 0. */
  phases: BeatmapPhase[];
  notes: BeatmapNote[];
}

/** Note instanciee pendant une partie. */
export interface Target extends BeatmapNote {
  id: number;
  hit: boolean;
  dead: boolean;
  grade: Grade | null;
  /** Duree du cercle d'approche, heritee de la phase de la note. */
  approach: number;
  /** Fenetres de timing effectives (secondes), heritees de la phase. */
  perfectWindow: number;
  goodWindow: number;
  /** Rayon effectif (fraction du plus petit cote), herite de la phase. */
  radius: number;
  phaseIndex: number;
}

/** Point 2D normalise dans la zone video. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Etat lisible par React (immuable, remplace a chaque changement). */
export interface GameSnapshot {
  phase: GamePhase;
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  counts: Record<Grade, number>;
  lastGrade: Grade | null;
  /** Identifiant croissant du dernier jugement : sert de `key` pour rejouer une animation. */
  lastEventId: number;
  /** Ecart signe du dernier hit en ms (negatif = trop tot). */
  lastOffsetMs: number;
  /** Temps de jeu, arrondi (rafraichi ~20 fois/s pour ne pas re-rendre a 60 fps). */
  time: number;
  duration: number;
  /** Au moins une main suivie actuellement. */
  handVisible: boolean;
  /** Nombre de mains suivies (0, 1 ou 2). */
  handCount: number;
  /** Phase courante de la beatmap. */
  phaseIndex: number;
  phaseCount: number;
  phaseName: string;
  phaseHint: string;
  /** Incremente a chaque changement de phase : sert de `key` pour la banniere. */
  phaseEventId: number;
}
