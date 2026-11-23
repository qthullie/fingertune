/** Catalogue of available beatmaps. Register yours here. */

import type { Beatmap } from '../game/types';
import { chromaticBeatmap } from './chromatic';
import { constellationBeatmap } from './constellation';
import { demoBeatmap } from './demo';

/**
 * Ordered as a first-time player should meet them.
 *
 * The demo teaches both note kinds at a pace that forgives everything, so it
 * stays first and stays the default. Chromatic adds things to avoid. The
 * maps after it are built as finales -- one song, one scene each -- and ask
 * for nothing the first two have not taught.
 */
export const beatmaps: Beatmap[] = [
  demoBeatmap,
  chromaticBeatmap,
  constellationBeatmap,
];

export const defaultBeatmap: Beatmap = demoBeatmap;

export const findBeatmap = (id: string | null | undefined): Beatmap | null =>
  beatmaps.find((beatmap) => beatmap.id === id) ?? null;
