/** Catalogue of available beatmaps. Register yours here. */

import type { Beatmap } from '../game/types';
import { constellationBeatmap } from './constellation';
import { demoBeatmap } from './demo';

/**
 * Ordered as a first-time player should meet them.
 *
 * The demo teaches both note kinds at a pace that forgives everything, so it
 * stays first and stays the default. Constellation is built as a finale --
 * one song, one scene -- and asks for nothing the demo has not taught.
 */
export const beatmaps: Beatmap[] = [
  demoBeatmap,
  constellationBeatmap,
];

export const defaultBeatmap: Beatmap = demoBeatmap;

export const findBeatmap = (id: string | null | undefined): Beatmap | null =>
  beatmaps.find((beatmap) => beatmap.id === id) ?? null;
