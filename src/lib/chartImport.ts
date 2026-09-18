/**
 * One entry point for "the player dropped a chart on the game".
 *
 * Four things can arrive: a bare .osu, a bare .sm, or either of those inside an
 * archive (.osz is a zip, and so is a .zip of a StepMania folder). The parsers
 * do not know about files and the UI should not know about formats, so the
 * sniffing, the unzipping and the audio hookup all live here.
 *
 * The archive case is the one worth supporting properly. A bare chart is a
 * chart with no music: the file names its audio and nothing else can find it,
 * so the player would have to pick a second file and know which one. An .osz
 * carries both, which turns "import a beatmap" into one drag.
 *
 * Nothing is uploaded. The archive is read in the tab, and the audio becomes an
 * object URL pointing at memory in this process — the same guarantee as the
 * rest of the game.
 */

import { settings } from '../config/settings';
import type { Beatmap } from '../game/types';
import { parseOsu } from './osu';
import { parseStepmania } from './stepmania';
import { openZip, type ZipEntry } from './zip';

export interface ImportedChart {
  beatmap: Beatmap;
  /** Object URL for the track, when the import carried one. */
  audioUrl: string | null;
  /** Artist and title, for showing what was loaded. */
  label: string;
  /** What the chart asked for but the import could not find. */
  missingAudio: string | null;
}

export class ChartImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartImportError';
  }
}

const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.m4a', '.opus', '.flac'];

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
};

function extensionOf(name: string): string {
  const at = name.lastIndexOf('.');
  return at < 0 ? '' : name.slice(at).toLowerCase();
}

/** A stable id, so two imports in one session do not collide in the picker. */
function slugId(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `import-${base || 'chart'}-${Date.now().toString(36)}`;
}

function parseChart(text: string, fileName: string): {
  beatmap: Beatmap;
  audioFilename: string;
  label: string;
} {
  const id = slugId(fileName);
  if (/^﻿?osu file format v\d+/m.test(text)) {
    return parseOsu(text, {
      id,
      baseWindowPerfect: settings.WINDOW_PERFECT,
      baseTargetRadius: settings.TARGET_RADIUS,
    });
  }
  if (/#NOTES\s*:/.test(text)) {
    return parseStepmania(text, { id });
  }
  throw new ChartImportError('Unrecognised chart: expected an osu! .osu or a StepMania .sm.');
}

/**
 * Picks which chart to load out of an archive that may hold several.
 *
 * Difficulties are not ordered in the file, and there is no field that means
 * "easiest". Sorting by name puts them in the mapper's own naming order, which
 * is arbitrary but stable — and the UI says which one was taken, so the player
 * can unzip and pick another rather than wonder.
 */
function chooseChart(entries: ZipEntry[]): ZipEntry {
  const charts = entries
    .filter((entry) => ['.osu', '.sm'].includes(extensionOf(entry.name)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const chosen = charts[0];
  if (!chosen) throw new ChartImportError('The archive contains no .osu or .sm chart.');
  return chosen;
}

/** Finds the track a chart named, falling back to the only audio file present. */
function findAudio(entries: ZipEntry[], wanted: string): ZipEntry | null {
  const audio = entries.filter((entry) => AUDIO_EXTENSIONS.includes(extensionOf(entry.name)));
  if (audio.length === 0) return null;

  const target = wanted.toLowerCase().replace(/\\/g, '/');
  const exact = audio.find((entry) => entry.name.toLowerCase().replace(/\\/g, '/') === target);
  if (exact) return exact;

  // Charts reference the file by bare name while the archive may nest it.
  const base = target.slice(target.lastIndexOf('/') + 1);
  const byBase = audio.find((entry) => entry.name.toLowerCase().endsWith(`/${base}`));
  if (byBase) return byBase;

  return audio.length === 1 ? (audio[0] as ZipEntry) : null;
}

/**
 * Reads whatever the player dropped.
 *
 * @throws ChartImportError with a message meant to be shown as-is.
 */
export async function importChart(file: File): Promise<ImportedChart> {
  const extension = extensionOf(file.name);

  if (extension === '.osz' || extension === '.zip') {
    const entries = await openZip(await file.arrayBuffer());
    const chartEntry = chooseChart(entries);
    const text = new TextDecoder('utf-8').decode(await chartEntry.read());
    const { beatmap, audioFilename, label } = parseChart(text, chartEntry.name);

    const audioEntry = audioFilename ? findAudio(entries, audioFilename) : null;
    let audioUrl: string | null = null;
    if (audioEntry) {
      const type = MIME_BY_EXTENSION[extensionOf(audioEntry.name)] ?? 'audio/mpeg';
      const bytes = await audioEntry.read();
      audioUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    }

    return {
      beatmap,
      audioUrl,
      label,
      missingAudio: audioUrl ? null : audioFilename || null,
    };
  }

  if (extension === '.osu' || extension === '.sm') {
    const { beatmap, audioFilename, label } = parseChart(await file.text(), file.name);
    // A bare chart cannot carry its music: the player picks it separately, and
    // the screen says which file to look for.
    return { beatmap, audioUrl: null, label, missingAudio: audioFilename || null };
  }

  throw new ChartImportError('Unsupported file: drop an .osz, .osu, .sm or .zip.');
}
