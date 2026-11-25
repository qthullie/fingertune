/**
 * Recorded sounds, for the tracks that need more than synthesis can give --
 * a breath, a knock, a voice. Loaded once, then played anywhere on the
 * music's clock.
 */

import * as Tone from 'tone';

export interface PlayOptions {
  /** Gain in dB. */
  volume?: number;
  /** Stereo position, -1 (left ear) to 1 (right ear). */
  pan?: number;
  /** Playback rate: below 1 is slower and lower. */
  rate?: number;
  /** Cut the sound off after this many seconds. */
  duration?: number;
  /** Where to send it, if not to the deck's own output. */
  output?: Tone.InputNode | undefined;
}

export class SampleDeck {
  private readonly instruments = new Map<string, Tone.Sampler>();

  private constructor(
    private readonly buffers: Map<string, Tone.ToneAudioBuffer>,
    private readonly output: Tone.InputNode,
  ) {}

  /** Fetches and decodes every file; resolves once all of them can play. */
  static async load(urls: Readonly<Record<string, string>>, output: Tone.InputNode): Promise<SampleDeck> {
    const entries = await Promise.all(
      Object.entries(urls).map(async ([name, url]) => [name, await Tone.ToneAudioBuffer.fromUrl(url)] as const),
    );
    return new SampleDeck(new Map(entries), output);
  }

  /**
   * Plays a sound once, at `time`. A fresh player per play: a source starts
   * only once in Web Audio, and overlapping plays of the same sound then need
   * no bookkeeping. Each one disposes of itself when it ends.
   */
  play(name: string, time: number, { volume = 0, pan = 0, rate = 1, duration, output }: PlayOptions = {}): void {
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const panner = new Tone.Panner(pan).connect(output ?? this.output);
    const player = new Tone.Player(buffer).connect(panner);
    player.volume.value = volume;
    player.playbackRate = rate;
    player.onstop = () => {
      player.dispose();
      panner.dispose();
    };
    player.start(time, 0, duration);
  }

  /**
   * One instrument's note, once: the sound replayed faster or slower until
   * it sounds `note`, taking `root` as the pitch it was recorded at. For
   * sparse notes, where a sampler would be one more thing to keep alive.
   */
  playNote(name: string, root: string, note: string, time: number, options: Omit<PlayOptions, 'rate'> = {}): void {
    const rate = Tone.Frequency(note).toFrequency() / Tone.Frequency(root).toFrequency();
    this.play(name, time, { ...options, rate });
  }

  /**
   * One sound as a pitched instrument, built on first use: the sampler
   * repitches it to any note, taking `root` as the pitch it was recorded at
   * (pitchesOf() in lib/sounds.ts knows it for every generated instrument).
   */
  instrument(name: string, root: string): Tone.Sampler | null {
    const cached = this.instruments.get(name);
    if (cached) return cached;
    const buffer = this.buffers.get(name);
    if (!buffer) return null;
    const sampler = new Tone.Sampler({ urls: { [root]: buffer }, release: 1.2 }).connect(this.output);
    this.instruments.set(name, sampler);
    return sampler;
  }

  dispose(): void {
    for (const sampler of this.instruments.values()) sampler.dispose();
    this.instruments.clear();
  }
}
