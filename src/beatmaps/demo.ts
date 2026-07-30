/**
 * Beatmap de demo (~100 s a 120 BPM), en TROIS PHASES de difficulte croissante.
 *
 *   1. Echauffement  — tres tres lent : une note toutes les 3 s, cercle
 *                      d'approche de 2.6 s. Le temps de lire, viser, pincer.
 *   2. Montee        — une note toutes les 1.25 s, approche 1.6 s, alternance
 *                      gauche/droite qui pousse a utiliser les deux mains.
 *   3. Les deux mains — approche 1.0 s, et des ACCORDS : deux cibles au meme
 *                      instant, une de chaque cote. Injouable a une seule main.
 *
 * Format d'une note : { x, y, t }
 *   x, y : position normalisee 0..1 dans l'image webcam affichee (deja en miroir,
 *          donc x = 0 est a TA gauche a l'ecran).
 *   t    : instant du hit, en secondes depuis le debut du morceau.
 *
 * La map est construite avec des helpers pour rester lisible, mais tu peux la
 * remplacer par un tableau litteral :
 *   notes: [ { x: 0.3, y: 0.4, t: 2 }, { x: 0.7, y: 0.4, t: 2.5 } ]
 */

import type { Beatmap, BeatmapNote, BeatmapPhase } from '../game/types';

const BPM = 120;
const BEAT = 60 / BPM; // 0.5 s
const INTRO = 2; // secondes de silence avant la premiere note

/** Convertit un numero de temps en secondes. */
const at = (beat: number): number => INTRO + beat * BEAT;

/** Une note par pas, le long d'une liste de positions. */
function path(
  startBeat: number,
  points: ReadonlyArray<readonly [number, number]>,
  step = 1,
): BeatmapNote[] {
  return points.map(([x, y], i) => ({ x, y, t: at(startBeat + i * step) }));
}

/** Plusieurs cibles au MEME instant : demande une main par cible. */
function chord(beat: number, points: ReadonlyArray<readonly [number, number]>): BeatmapNote[] {
  return points.map(([x, y]) => ({ x, y, t: at(beat) }));
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

/* -------------------------------------------------------------------------- */
/* Phase 1 — Echauffement : une note toutes les 6 temps (3 s), au centre.      */
/* -------------------------------------------------------------------------- */
const phase1: BeatmapNote[] = path(
  0,
  [
    [0.5, 0.5],
    [0.35, 0.5],
    [0.65, 0.5],
    [0.35, 0.35],
    [0.65, 0.35],
    [0.3, 0.62],
    [0.7, 0.62],
    [0.5, 0.32],
    [0.25, 0.45],
    [0.75, 0.45],
    [0.5, 0.68],
    [0.5, 0.4],
  ],
  6,
);

/* -------------------------------------------------------------------------- */
/* Phase 2 — Montee : une note toutes les 2.5 temps (1.25 s), plus large.      */
/* -------------------------------------------------------------------------- */
const phase2: BeatmapNote[] = [
  ...path(
    72,
    [
      [0.22, 0.4],
      [0.78, 0.4],
      [0.22, 0.65],
      [0.78, 0.65],
      [0.3, 0.3],
      [0.7, 0.3],
      [0.5, 0.5],
      [0.18, 0.55],
    ],
    2.5,
  ),
  ...ring(92, 8, 0.5, 0.5, 0.26, 2.5, -Math.PI / 2),
  ...path(
    112,
    [
      [0.2, 0.7],
      [0.8, 0.7],
      [0.35, 0.3],
      [0.65, 0.3],
      [0.2, 0.45],
      [0.8, 0.45],
      [0.5, 0.62],
      [0.5, 0.35],
    ],
    2.5,
  ),
];

/* -------------------------------------------------------------------------- */
/* Phase 3 — Les deux mains : accords simultanes + rafales alternees.          */
/* -------------------------------------------------------------------------- */
const phase3: BeatmapNote[] = [
  // Premiers accords, bien espaces : le temps de placer les deux mains.
  ...chord(136, [
    [0.25, 0.45],
    [0.75, 0.45],
  ]),
  ...chord(140, [
    [0.25, 0.65],
    [0.75, 0.65],
  ]),
  ...chord(144, [
    [0.3, 0.3],
    [0.7, 0.3],
  ]),

  // Rafale alternee gauche / droite.
  ...path(
    148,
    [
      [0.25, 0.5],
      [0.75, 0.5],
      [0.22, 0.35],
      [0.78, 0.35],
      [0.25, 0.68],
      [0.75, 0.68],
    ],
    1.5,
  ),

  // Accords en diagonale : une main haute, une main basse.
  ...chord(158, [
    [0.28, 0.3],
    [0.72, 0.68],
  ]),
  ...chord(161, [
    [0.28, 0.68],
    [0.72, 0.3],
  ]),
  ...chord(164, [
    [0.2, 0.5],
    [0.8, 0.5],
  ]),

  // Rafale finale, resserree.
  ...path(
    168,
    [
      [0.3, 0.4],
      [0.7, 0.4],
      [0.3, 0.6],
      [0.7, 0.6],
      [0.4, 0.32],
      [0.6, 0.32],
      [0.35, 0.7],
      [0.65, 0.7],
    ],
    1.5,
  ),

  // Accord de fin, tenu au centre.
  ...chord(182, [
    [0.33, 0.5],
    [0.67, 0.5],
  ]),
];

/**
 * Les phases. `start` est en secondes de beatmap (avant le decompte) : on le
 * place un peu avant la premiere note de la phase pour que la banniere ait le
 * temps de s'afficher.
 */
const phases: BeatmapPhase[] = [
  {
    id: 'warmup',
    name: 'Phase 1 — Echauffement',
    hint: 'Tres lent. Prends le temps de viser, pince quand le cercle se referme.',
    start: 0,
    approachTime: 2.6,
  },
  {
    id: 'buildup',
    name: 'Phase 2 — Montee',
    hint: 'Ca accelere. Utilise tes deux mains pour couvrir les deux cotes.',
    start: at(72) - 2.5,
    approachTime: 1.6,
  },
  {
    id: 'duo',
    name: 'Phase 3 — Les deux mains',
    hint: 'Cibles simultanees : une main de chaque cote, en meme temps.',
    start: at(136) - 2.5,
    approachTime: 1.0,
  },
];

export const demoBeatmap: Beatmap = {
  id: 'demo',
  title: 'Demo — Trois phases',
  author: 'Fingertune',
  bpm: BPM,
  phases,
  // Toujours trier par temps : le moteur suppose un ordre croissant.
  notes: [...phase1, ...phase2, ...phase3].sort((a, b) => a.t - b.t),
};
