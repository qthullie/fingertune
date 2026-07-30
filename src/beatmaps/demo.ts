/**
 * Beatmap de demo (~80 s a 120 BPM).
 *
 * Format d'une note : { x, y, t }
 *   x, y : position normalisee 0..1 dans l'image webcam affichee (deja en miroir,
 *          donc x = 0 est a TA gauche a l'ecran).
 *   t    : instant du hit, en secondes depuis le debut du morceau.
 *
 * La map est construite avec quelques helpers pour rester lisible, mais tu peux
 * la remplacer par un tableau litteral :
 *   notes: [ { x: 0.3, y: 0.4, t: 2 }, { x: 0.7, y: 0.4, t: 2.5 } ]
 *
 * Pour ajouter une map : cree un fichier voisin, exporte un `Beatmap`, et
 * reference-le dans src/beatmaps/index.ts.
 */

import type { Beatmap, BeatmapNote } from '../game/types';

const BPM = 120;
const BEAT = 60 / BPM; // 0.5 s
const INTRO = 2; // secondes de silence avant la premiere note

/** Convertit un numero de temps en secondes. */
const at = (beat: number): number => INTRO + beat * BEAT;

/** Une note par pas, le long d'une liste de positions. */
function path(startBeat: number, points: ReadonlyArray<readonly [number, number]>, step = 1): BeatmapNote[] {
  return points.map(([x, y], i) => ({ x, y, t: at(startBeat + i * step) }));
}

/** n notes reparties sur un cercle (aplati verticalement pour tenir a l'ecran). */
function ring(
  startBeat: number,
  count: number,
  cx: number,
  cy: number,
  radius: number,
  step = 1,
  phase = 0,
): BeatmapNote[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = phase + (i / count) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 1.25,
      t: at(startBeat + i * step),
    };
  });
}

const notes: BeatmapNote[] = [
  // Intro : alternance gauche / droite, une note toutes les deux temps.
  ...path(
    0,
    [
      [0.3, 0.45],
      [0.7, 0.45],
      [0.3, 0.6],
      [0.7, 0.6],
      [0.35, 0.35],
      [0.65, 0.35],
      [0.5, 0.55],
      [0.5, 0.35],
    ],
    2,
  ),

  // Montee : zigzag plus serre.
  ...path(
    16,
    [
      [0.25, 0.3],
      [0.45, 0.55],
      [0.65, 0.3],
      [0.8, 0.55],
      [0.65, 0.75],
      [0.45, 0.5],
      [0.25, 0.7],
      [0.5, 0.45],
    ],
    1.5,
  ),

  // Couplet : cercle horaire.
  ...ring(30, 8, 0.5, 0.5, 0.22, 1, -Math.PI / 2),

  // Respiration : notes espacees, grands deplacements.
  ...path(
    40,
    [
      [0.18, 0.3],
      [0.82, 0.3],
      [0.18, 0.72],
      [0.82, 0.72],
      [0.5, 0.5],
    ],
    2,
  ),

  // Pont : escalier montant.
  ...path(
    52,
    [
      [0.22, 0.75],
      [0.34, 0.65],
      [0.46, 0.55],
      [0.58, 0.45],
      [0.7, 0.35],
      [0.8, 0.28],
    ],
    1,
  ),

  // Refrain : cercle inverse, plus rapide.
  ...ring(60, 8, 0.5, 0.5, 0.28, 0.75, Math.PI / 2),

  // Final : rafale gauche/droite puis note isolee au centre.
  ...path(
    68,
    [
      [0.28, 0.42],
      [0.72, 0.42],
      [0.28, 0.62],
      [0.72, 0.62],
      [0.4, 0.3],
      [0.6, 0.3],
      [0.4, 0.7],
      [0.6, 0.7],
    ],
    0.75,
  ),
  { x: 0.5, y: 0.5, t: at(76) },
];

export const demoBeatmap: Beatmap = {
  id: 'demo',
  title: 'Demo — Pinch Warmup',
  author: 'Fingertune',
  bpm: BPM,
  // Toujours trier par temps : le moteur suppose un ordre croissant pour l'affichage.
  notes: notes.sort((a, b) => a.t - b.t),
};
