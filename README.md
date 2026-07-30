<p align="center">
  <img src="assets/logo.svg" alt="fingertune logo — pixel-art approach ring closing on a target" width="160"/>
</p>

<h1 align="center">Fingertune</h1>

<p align="center">
  <a href="https://github.com/qthullie/fingertune/actions/workflows/ci.yml"><img src="https://github.com/qthullie/fingertune/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"/></a>
  <img src="https://img.shields.io/badge/MediaPipe-Hand%20Landmarker-ff6f00.svg" alt="MediaPipe Hand Landmarker"/>
  <img src="https://img.shields.io/badge/inference-on--device-4dffb0.svg" alt="On-device inference"/>
  <img src="https://img.shields.io/badge/typescript-strict-3178c6.svg" alt="TypeScript strict"/>
</p>

> Recognising a hand is easy now. Recognising *when* a gesture happened, to
> within 60 milliseconds, on a consumer webcam, is not. That is the whole
> problem this repository is about — the rhythm game is just the harness that
> makes every error audible.

**Real-time hand-gesture recognition in the browser**, turned into a playable
instrument. A webcam feeds **MediaPipe Hand Landmarker**; the pipeline smooths
the landmarks, decides when thumb and index are *pinched*, and timestamps that
event precisely enough to judge it against a musical beat. One hand, one gesture,
judged in tens of milliseconds.

Everything runs **on-device**: inference is WebAssembly + GPU delegate inside the
tab. No frame, no landmark, no score ever leaves the machine.

## Table of contents

- [The recognition pipeline](#the-recognition-pipeline)
  - [1. Landmarks](#1-landmarks)
  - [2. Smoothing: One-Euro filter](#2-smoothing-one-euro-filter)
  - [3. Pinch detection](#3-pinch-detection)
  - [4. Coordinate spaces](#4-coordinate-spaces)
  - [5. Timing and latency](#5-timing-and-latency)
  - [Tuning and diagnosis](#tuning-and-diagnosis)
- [The game around it](#the-game-around-it)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Running fully offline](#running-fully-offline)
- [License](#license)

---

## The recognition pipeline

```
webcam frame (1280×720, VIDEO mode)
      │
      ▼
MediaPipe Hand Landmarker — hand_landmarker.task, float16, GPU delegate
      │  21 landmarks per hand, normalised to the frame
      ▼
mirror x ↦ 1 − x                          (display is mirrored, or it is unplayable)
      │
      ▼
One-Euro filter, one per landmark          lib/oneEuro.ts
      │  21 × 2 adaptive low-passes: still hand ⇒ no jitter, fast hand ⇒ no lag
      ▼
pinch ratio  =  ‖thumb₄ − index₈‖ / ‖wrist₀ − middleMCP₉‖
      │  scale-invariant: same threshold near or far from the camera
      ▼
hysteresis state machine + cooldown         lib/handTracking.ts
      │  ratio < 0.42 ⇒ PINCHED, ratio > 0.62 ⇒ RELEASED, ≥140 ms between triggers
      ▼
rising edge "justPinched" + cursor (thumb–index midpoint)
      │
      ▼
judged against the audio clock: |now − t| ⇒ PERFECT / GOOD / MISS
```

### 1. Landmarks

MediaPipe Hand Landmarker in `VIDEO` running mode, `float16` model, GPU
delegate, `numHands: 1`. Detection is driven from the render loop but skipped
whenever `video.currentTime` has not advanced — the webcam produces ~30 fps while
the loop runs at 60, and inferring twice on the same frame is pure waste.

Only four of the 21 landmarks drive the *decision* — thumb tip (4), index tip
(8), wrist (0), middle-finger MCP (9) — but all 21 are smoothed and drawn, so you
can see exactly what the model sees while you play.

### 2. Smoothing: One-Euro filter

Raw landmarks jitter by a few pixels even on a perfectly still hand. A fixed
low-pass would fix that and add lag precisely when you move fast — fatal for a
game judged in tens of milliseconds.

The [One-Euro filter](https://gery.casiez.net/1euro/) (Casiez, Roussel & Vogel,
CHI 2012) adapts its cutoff frequency to the observed speed:

```
α(cutoff, dt) = 1 / (1 + τ/dt),        τ = 1/(2π·cutoff)
cutoff        = MIN_CUTOFF + BETA · |x̂˙|
```

Slow movement collapses to `MIN_CUTOFF` (heavy smoothing, no jitter); fast
movement raises the cutoff (light smoothing, little lag). Two knobs:
`OEF_MIN_CUTOFF = 1.7` and `OEF_BETA = 0.02`, per axis, per landmark
([`src/lib/oneEuro.ts`](src/lib/oneEuro.ts)).

### 3. Pinch detection

A raw thumb–index distance is useless as a threshold: it shrinks as you move away
from the camera. So the distance is **normalised by the hand's own scale**:

```ts
ratio = ‖thumb₄ − index₈‖ / ‖wrist₀ − middleMCP₉‖
```

The denominator is a rigid segment of the palm — it changes with distance and
hand size exactly like the numerator, so their quotient does not.

That ratio drives a two-threshold state machine. A single threshold at the
boundary would flicker between states on noise alone, firing phantom hits:

| Current state | Condition | Result |
| --- | --- | --- |
| released | `ratio < PINCH_ON_RATIO` (0.45) | → **pinched**, emit `justPinched` |
| pinched | `ratio > PINCH_OFF_RATIO` (0.65) | → released |
| pinched | `0.45 ≤ ratio ≤ 0.65` | stay pinched (dead band) |

A hit is only ever triggered by the **rising edge**, never by the steady state,
and a `PINCH_COOLDOWN_MS = 140` guard rejects a second trigger inside one
gesture. The cursor is the thumb–index midpoint, which stays stable through the
closing motion.

Sliders use the other half of that state machine: the **held** state. Grabbing a
slider head is an edge; keeping it is a per-frame test of `pinching` plus
proximity to the moving ball. That asks something harder of the tracking than a
tap does — the pinch has to survive translation and rotation of the hand for
seconds at a time, which is exactly where a fixed low-pass filter would either
lag behind the drag or let go on jitter.

The edge is also cleared at the start of every detection pass: the webcam runs at
~30 fps while the render loop runs at 60, so a flag left standing would be read
twice and one pinch would consume two targets.

An always-on meter (bottom right, <kbd>P</kbd> to hide) shows the live ratio
against both thresholds — the fastest way to tell "the gesture was not
recognised" apart from "recognised, but off-target or off-beat". A pinch that
hits nothing draws a small white ring at the cursor, so a recognised-but-missed
gesture is still visible.

The pipeline loops over N hands and assigns each detection to a fixed slot from
its **handedness** label rather than its position in the result array — MediaPipe
can swap that order between frames, which would hand one hand's filter state to
the other. `MAX_HANDS` is 1 by default; raising it to 2 works, but the demo chart
is written for one hand.

### 4. Coordinate spaces

The video is mirrored (a non-mirrored feed is unplayable — your hand goes the
wrong way), so landmark `x` becomes `1 − x` at the source and everything
downstream lives in that mirrored space.

There are then **two** spaces, and conflating them is a real bug:

- the **view**, the webcam rectangle drawn in CSS-`cover` fit. Landmarks live
  here, because that is what MediaPipe reports against. In `cover` this rectangle
  is usually *larger* than the window, so part of it is off-screen.
- the **playfield**, the visible intersection of that rectangle and the canvas,
  minus a small margin. Targets live here.

A target placed at `x = 0.2` in *view* space lands outside the window whenever
the window's aspect ratio differs from the webcam's — visible nowhere,
unreachable. Both spaces are converted to pixels
([`src/render/view.ts`](src/render/view.ts)) and hit tests happen there, so the
hit area also stays circular. Press <kbd>F</kbd> to outline the playfield.

### 5. Timing and latency

The judgement clock is the **audio context** (`Tone.now()`), not
`requestAnimationFrame`: a dropped frame then costs pixels, never milliseconds,
and hit windows stay aligned with the music.

What that clock cannot recover is the delay already baked into the input:
webcam exposure and USB transfer, then inference, then the browser's audio output
buffer. The pipeline measures the pinch when it *sees* it, which is inevitably
after it happened. If everything reads late on your machine, shorten
`APPROACH_TIME` to compensate.

### Tuning and diagnosis

Press <kbd>D</kbd> in game for a live overlay: FPS, per-hand tracking state,
handedness, the current pinch ratio and the active thresholds. Watching the ratio
while you pinch is the fastest way to pick your own numbers.

| Setting | Default | Effect |
| --- | --- | --- |
| `PINCH_ON_RATIO` | `0.45` | activation threshold — lower it if hits fire before you close |
| `PINCH_OFF_RATIO` | `0.65` | release threshold — widen the gap if the state flickers |
| `PINCH_COOLDOWN_MS` | `140` | minimum delay between two triggers |
| `OEF_MIN_CUTOFF` | `1.7` | lower = smoother cursor, more lag |
| `OEF_BETA` | `0.02` | higher = snappier on fast moves, more jitter |
| `MAX_HANDS` | `1` | tracked hands (2 works; the demo chart is one-handed) |
| `MIN_DETECTION_CONF` / `MIN_TRACKING_CONF` | `0.5` | MediaPipe confidence gates |
| `HAND_LOST_TIMEOUT` | `0.5 s` | grace period before a hand is forgotten |
| `SHOW_SKELETON` | `true` | draw all 21 landmarks and bones |
| `SHOW_PINCH_METER` | `true` | live ratio gauge with both thresholds |
| `SHOW_PLAYFIELD` | `false` | outline the area targets can occupy |
| `SLIDER_FOLLOW_SCALE` | `2.2` | follow-circle radius: how much slack while dragging |
| `SLIDER_TICK_INTERVAL` | `0.22 s` | spacing of the tick feedback while following |

Everything is in [`src/config/settings.ts`](src/config/settings.ts) and mutable
live, without a reload:

```js
fingertune.settings.PINCH_ON_RATIO = 0.35;
fingertune.settings.DEBUG = true;
```

---

## The game around it

Short version, because the pipeline above is the point.

It is an Osu!-style rhythm game with two note types:

- **circles** — pinch once, as the approach ring closes on the target;
- **sliders** — pinch the head, then *keep pinching* and drag along the track,
  following the ball in the direction of the arrows. Ticks sound while you
  follow. Letting go mid-way is a slider break: it costs the combo, and you can
  grab it again, but the body is graded on the fraction you actually followed
  (`SLIDER_PERFECT_RATIO` 0.85, `SLIDER_GOOD_RATIO` 0.5). One slider therefore
  produces two judgements, head and body, like Osu!.

Hits are graded **Perfect**, **Good** or **Miss**, with a combo and weighted
accuracy. The demo chart runs in three difficulty phases, and each one scales the
ring speed, the timing windows *and* the target size:

| Phase | Approach ring | Timing windows | Targets | Pace |
| --- | --- | --- | --- | --- |
| Easy | 2.6 s | ×3 (Perfect 180 ms) | ×1.4 | one note every 3 s |
| Medium | 1.6 s | ×1.8 | ×1.15 | one note every 1.25 s |
| Hard | 1.0 s | ×1 (Perfect 60 ms) | ×1 | one note every 0.75 s |

The soundtrack is synthesised by Tone.js on the same transport and grows with
each phase; misses are audible; the best score per beatmap is kept in
`localStorage`.

Charts are plain data — `{ x, y, t }` notes (plus `kind: 'slider'`, `path` and
`duration` for sliders) and phase definitions — in
[`src/beatmaps/demo.ts`](src/beatmaps/demo.ts), which also has `path()`, `ring()`
and `slider()` helpers. Add yours and register it in
[`src/beatmaps/index.ts`](src/beatmaps/index.ts). To play on your own music, drop
a file in `public/music/` and set `VITE_MUSIC_URL`.

Shortcuts: <kbd>R</kbd> replay · <kbd>M</kbd> metronome · <kbd>S</kbd> skeleton ·
<kbd>P</kbd> pinch gauge · <kbd>F</kbd> playfield · <kbd>D</kbd> debug.

## Quick start

```bash
git clone https://github.com/qthullie/fingertune.git
cd fingertune
npm install
npm run dev
```

Open the printed URL and click **Autoriser la webcam / Jouer**. The model (~7 MB)
downloads on first launch, then stays cached.

> The webcam needs a secure context: `localhost` or `https://`. A file opened
> over `file://` is blocked by most browsers.

```bash
npm run build             # typecheck + static build into dist/
npm run build:standalone  # one self-contained HTML into standalone/fingertune.html
```

`dist/` uses a relative base, so it works as-is on GitHub Pages (see
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), Netlify, Vercel
or any static host — over https.

## Project layout

```
src/
  lib/
    handTracking.ts   MediaPipe, landmark smoothing, pinch state machine, hand slots
    oneEuro.ts        One-Euro filter
    audio.ts          Tone.js: reference clock, generated soundtrack, hit/miss sounds
    highscores.ts     localStorage best scores
    errors.ts         technical errors → human messages
  config/settings.ts  every knob, mutable at runtime
  game/               engine (timing windows, score, phases), slider geometry,
                      effects, types
  render/             view + playfield transforms, renderer (video, targets, skeleton)
  components/         GameCanvas (loop), Hud, Start/Error/End screens
  beatmaps/           charts and phase definitions
```

## Running fully offline

The wasm binaries are already served from your own origin (copied out of
`node_modules` by [`scripts/copy-assets.mjs`](scripts/copy-assets.mjs)); only the
model comes from Google's CDN. To host that too:

```bash
npm run fetch:model
echo "VITE_HAND_MODEL_URL=./models/hand_landmarker.task" > .env.local
```

## License

[MIT](LICENSE). The `hand_landmarker.task` model is provided by Google under
Apache 2.0. The pixel-art logo is original artwork, MIT licensed with the
project.
