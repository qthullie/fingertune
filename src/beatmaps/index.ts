/** Catalogue of available beatmaps. Register yours here. */

import type { Beatmap } from '../game/types';
import { demoBeatmap } from './demo';
import { pulseBeatmap } from './pulse';
import { driftBeatmap } from './drift';
import { duetBeatmap } from './duet';

/**
 * Ordered as a first-time player should meet them.
 *
 * The demo teaches both note kinds at a pace that forgives everything, so it
 * stays first and stays the default. The other two each remove something: Pulse
 * has no sliders and leans entirely on timing, Drift is almost all sliders and
 * leans on holding a pinch steady while the hand travels. Neither is "harder"
 * than the other -- they fail for different reasons, which is the point.
 *
 * Duet is last because it is the only one that needs both hands, which is a
 * coordination problem rather than a harder version of the same one.
 */
export const beatmaps: Beatmap[] = [demoBeatmap, pulseBeatmap, driftBeatmap, duetBeatmap];

export const defaultBeatmap: Beatmap = demoBeatmap;

export const findBeatmap = (id: string | null | undefined): Beatmap | null =>
  beatmaps.find((beatmap) => beatmap.id === id) ?? null;
