/** Catalogue of available beatmaps. Register yours here. */

import type { Beatmap } from '../game/types';
import { demoBeatmap } from './demo';

export const beatmaps: Beatmap[] = [demoBeatmap];

export const defaultBeatmap: Beatmap = demoBeatmap;
