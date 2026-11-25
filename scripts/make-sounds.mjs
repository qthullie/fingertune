/**
 * Generates the recorded sounds of the scene maps with ElevenLabs, into
 * src/assets/<set>/ -- one set per soundtrack that has some.
 *
 * Run by hand; the results are committed, so neither a build nor a player
 * ever needs the key. The prompts below are the source of those files:
 * change one and regenerate it.
 *
 *   ELEVENLABS_API_KEY in .env.local (or the environment), then
 *   node scripts/make-sounds.mjs                     every missing file, every set
 *   node scripts/make-sounds.mjs constellation       every missing file of one set
 *   node scripts/make-sounds.mjs constellation harp  only these, even if present
 *
 * Each raw result goes through ffmpeg: mono (the game pans them itself),
 * leading silence trimmed, loudness normalised, short fades so nothing clicks,
 * then 96 kbps mp3 to keep the repository light.
 *
 * Generated with a paid ElevenLabs plan, whose terms allow commercial use.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const STAGING = join(root, '.sounds-build');

/**
 * The sets. `effects` are sound effects: a name, a prompt, a length in
 * seconds. An effect with `tonal: true` is an instrument the game repitches
 * into melodies: the script finds the note it was generated on, tunes it to
 * the nearest semitone, and records that note in the set's pitches.json.
 * `lines` are whispered words, one file per language: `<name>.<lang>.mp3`.
 */
const SETS = {
  /*
   * Constellation (beatmaps/constellation.ts): an observatory among the
   * stars. A small orchestra -- celesta, harp, glockenspiel, pizzicato,
   * strings, choir -- played a note at a time by the soundtrack, and the
   * sparkle and sweep of things in the sky.
   */
  constellation: {
    effects: [
      {
        name: 'celesta',
        seconds: 1.5,
        tonal: true,
        prompt: 'One single soft celesta note, bell-like and sparkling, played once, close, no reverb, no other notes.',
      },
      {
        name: 'harp',
        seconds: 2,
        tonal: true,
        prompt: 'One single plucked concert harp note, warm and round, played once, no reverb, no other notes.',
      },
      {
        name: 'glock',
        seconds: 1.5,
        tonal: true,
        prompt: 'One single glockenspiel note, bright and pure, struck once, no reverb, no other notes.',
      },
      {
        name: 'pizz',
        seconds: 1,
        tonal: true,
        prompt: 'One single pizzicato note plucked by a violin section, light and bouncy, no reverb, no other notes.',
      },
      {
        name: 'strings',
        seconds: 4,
        tonal: true,
        // Solo: an ensemble prompt comes back as a chord, which no sampler can repitch.
        prompt: 'A solo cello holding one single long bowed note, warm and soft, one pitch only, no melody, no other instruments.',
      },
      {
        name: 'choir',
        seconds: 4,
        tonal: true,
        prompt: "A single soprano voice singing one long sustained 'aah' on one pitch only, soft, airy and pure, no harmony, no instruments.",
      },
      { name: 'timpani', seconds: 2, prompt: 'One single soft orchestral timpani hit, deep and round, with a short ring.' },
      { name: 'triangle', seconds: 2, prompt: 'One single orchestral triangle ding, clear and ringing.' },
      {
        name: 'sparkle',
        seconds: 1,
        prompt: 'A magical sparkle: a quick shimmer of tiny high chimes, like a star being collected in a video game.',
      },
      {
        name: 'glissando',
        seconds: 2,
        prompt: 'An ascending concert harp glissando sweeping up quickly, bright and magical.',
      },
      {
        name: 'shooting',
        seconds: 2,
        prompt: 'A shooting star streaking across the night sky: a soft airy whoosh with a long shimmering, twinkling tail.',
      },
      {
        name: 'swell',
        seconds: 4,
        prompt: 'An orchestral build-up: a rolling timpani and a cymbal swelling louder and louder, cut off at its peak.',
      },
      {
        name: 'freeze',
        seconds: 3,
        prompt: 'A gentle magical hush: a soft bell and a shimmering choir chord swelling, as if time softly holds still among the stars.',
      },
      {
        name: 'release',
        seconds: 1.5,
        prompt: 'A bright magical release: an upward burst of glittering chimes and a soft whoosh.',
      },
    ],
    lines: [],
  },
};

/** A quiet female voice per language; eleven_v3 whispers on the [whispers] tag. */
const VOICES = { en: 'pFZP5JQG7iQjIQuC4Bku', fr: 'O31r762Gb3WFygrEOGh0' };

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const file = join(root, '.env.local');
  const match = existsSync(file) ? readFileSync(file, 'utf8').match(/^ELEVENLABS_API_KEY=(.+)$/m) : null;
  if (!match?.[1]) throw new Error('ELEVENLABS_API_KEY is not set (environment or .env.local).');
  return match[1].trim();
}

async function post(path, body) {
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Loudest sample of a file, in dB, as ffmpeg's volumedetect reports it. */
function peak(file) {
  // The report goes to stderr, which spawnSync hands back and execFileSync does not.
  const { stderr } = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  return Number(stderr.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? -Infinity);
}

/**
 * Mono, trimmed, normalised, faded, 96 kbps.
 *
 * A generation now and then comes back as near silence; normalised, that
 * would be a file of amplified noise, and trimmed, an empty one. Refused
 * instead, so it gets regenerated rather than committed.
 */
function finish(raw, target, seconds) {
  if (peak(raw) < -30) throw new Error(`${target}: the generation came back silent; run it again.`);
  const fadeOut = Math.min(0.3, seconds / 5);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel', 'error',
    '-i', raw,
    '-ac', '1',
    '-af',
    [
      'silenceremove=start_periods=1:start_threshold=-50dB',
      'loudnorm=I=-16:TP=-1.5:LRA=11',
      'afade=t=in:d=0.005',
      `areverse,afade=t=in:d=${fadeOut},areverse`,
    ].join(','),
    '-ar', '44100',
    '-b:a', '96k',
    target,
  ]);
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * The fundamental of a held note, in Hz, from a stretch past its attack.
 *
 * Normalised autocorrelation, keeping the FIRST lag that correlates nearly as
 * well as the best one rather than the best itself: a note also correlates
 * with itself one, two, three periods later, and the best of those is as
 * often an octave or two too low. Parabolic interpolation around that lag
 * keeps high notes, whose periods are only a few samples long, accurate.
 */
function fundamental(file) {
  const rate = 44100;
  const { stdout } = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const samples = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4));
  const start = Math.floor(rate * 0.1);
  const size = Math.min(8192, samples.length - start - 2048);
  const minLag = Math.floor(rate / 4200);
  const maxLag = Math.floor(rate / 50);
  const scores = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0;
    let a = 0;
    let b = 0;
    for (let i = start; i < start + size; i++) {
      sum += samples[i] * samples[i + lag];
      a += samples[i] * samples[i];
      b += samples[i + lag] * samples[i + lag];
    }
    scores[lag] = sum / Math.sqrt(a * b + 1e-12);
  }
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) best = Math.max(best, scores[lag]);
  let lag = minLag;
  for (let l = minLag + 1; l < maxLag; l++) {
    if (scores[l] >= 0.9 * best && scores[l] >= scores[l - 1] && scores[l] >= scores[l + 1]) {
      lag = l;
      break;
    }
  }
  const [left, centre, right] = [scores[lag - 1], scores[lag], scores[lag + 1]];
  const shift = (left - right) / (2 * (left - 2 * centre + right) || 1);
  return rate / (lag + (Number.isFinite(shift) ? shift : 0));
}

/**
 * Tunes a sampled note to the nearest semitone, in place, without changing
 * its length; returns that note's name. The game repitches from it, so every
 * instrument of a set ends up in tune with the others.
 */
function tune(file) {
  const hz = fundamental(file);
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  const ratio = 2 ** ((nearest - midi) / 12);
  const tuned = `${file}.tuned.mp3`;
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', file,
    '-af', `asetrate=${44100 * ratio},aresample=44100,atempo=${1 / ratio}`,
    '-b:a', '96k', tuned,
  ]);
  rmSync(file);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tuned, '-c', 'copy', file]);
  rmSync(tuned);
  return `${NOTES[nearest % 12]}${Math.floor(nearest / 12) - 1}`;
}

const [onlySet, ...onlyNames] = process.argv.slice(2);
if (onlySet && !(onlySet in SETS)) throw new Error(`No sound set "${onlySet}": ${Object.keys(SETS).join(', ')}.`);
const only = new Set(onlyNames);
const wanted = (name) => (only.size > 0 ? only.has(name) : true);
const missing = (file) => only.size > 0 || !existsSync(file);

mkdirSync(STAGING, { recursive: true });
try {
  for (const [set, { effects, lines }] of Object.entries(SETS)) {
    if (onlySet && set !== onlySet) continue;
    const out = join(root, 'src', 'assets', set);
    mkdirSync(out, { recursive: true });
    console.log(set);
    await generate(out, effects, lines);
    const pitched = effects.filter((effect) => effect.tonal);
    if (pitched.length > 0) {
      const manifest = join(out, 'pitches.json');
      const pitches = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : {};
      for (const effect of pitched) {
        if (!(effect.name in pitches) || only.has(effect.name)) {
          pitches[effect.name] = tune(join(out, `${effect.name}.mp3`));
          console.log(`  ${effect.name.padEnd(10)} tuned to ${pitches[effect.name]}`);
        }
      }
      writeFileSync(manifest, `${JSON.stringify(pitches, null, 2)}\n`);
    }
  }
} finally {
  rmSync(STAGING, { recursive: true, force: true });
}

async function generate(out, effects, lines) {
  for (const effect of effects) {
    const target = join(out, `${effect.name}.mp3`);
    if (!wanted(effect.name) || !missing(target)) continue;
    process.stdout.write(`  ${effect.name.padEnd(10)} `);
    const raw = join(STAGING, `${effect.name}.mp3`);
    writeFileSync(
      raw,
      await post('/v1/sound-generation?output_format=mp3_44100_128', {
        text: effect.prompt,
        duration_seconds: effect.seconds,
        prompt_influence: 0.6,
      }),
    );
    finish(raw, target, effect.seconds);
    console.log('ok');
  }

  for (const line of lines) {
    for (const lang of ['en', 'fr']) {
      const target = join(out, `${line.name}.${lang}.mp3`);
      if (!wanted(line.name) || !missing(target)) continue;
      process.stdout.write(`  ${`${line.name}.${lang}`.padEnd(10)} `);
      const raw = join(STAGING, `${line.name}.${lang}.mp3`);
      writeFileSync(
        raw,
        await post(`/v1/text-to-speech/${VOICES[lang]}?output_format=mp3_44100_128`, {
          text: `[whispers] ${line[lang]}`,
          model_id: 'eleven_v3',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      );
      finish(raw, target, 2);
      console.log('ok');
    }
  }
}
