/**
 * The scene maps' recorded sounds: every file in src/assets/<set>/, generated
 * by scripts/make-sounds.mjs, by set and then by name. Vite turns each into a
 * URL and only fetches it when a map that plays it is about to start.
 *
 * An instrument's file comes with the note it is tuned to, from the set's
 * pitches.json: the samplers repitch from it.
 */

const files = import.meta.glob<string>('../assets/*/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});

const manifests = import.meta.glob<Record<string, string>>('../assets/*/pitches.json', {
  eager: true,
  import: 'default',
});

const sets = new Map<string, Record<string, string>>();
for (const [path, url] of Object.entries(files)) {
  const [set, file] = path.split('/').slice(-2);
  if (!set || !file) continue;
  const named = sets.get(set) ?? {};
  named[file.slice(0, -'.mp3'.length)] = url;
  sets.set(set, named);
}

/** The sounds of one set, by name: `soundSet('constellation').harp`. */
export function soundSet(name: string): Readonly<Record<string, string>> {
  return sets.get(name) ?? {};
}

/** The note each instrument of a set is tuned to: `pitchesOf('constellation').harp`. */
export function pitchesOf(name: string): Readonly<Record<string, string>> {
  return manifests[`../assets/${name}/pitches.json`] ?? {};
}
