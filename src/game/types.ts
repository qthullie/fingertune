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

export interface Beatmap {
  id: string;
  title: string;
  author: string;
  bpm: number;
  notes: BeatmapNote[];
}

/** Note instanciee pendant une partie. */
export interface Target extends BeatmapNote {
  id: number;
  hit: boolean;
  dead: boolean;
  grade: Grade | null;
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
}
