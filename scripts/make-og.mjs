/**
 * Draws public/og.png, the card LinkedIn, Slack and Discord show for a link.
 *
 * Why this exists at all: a link posted without one renders as a grey box with
 * a domain in it, and the whole point of posting the playable URL rather than
 * the repository is that someone sees the game and presses play. The card is
 * the only part of the game most people will ever look at.
 *
 * Why it is a script and not a PNG committed by hand: the card is drawn from
 * assets/logo.svg, so re-colouring the sprite re-colours the card, and nothing
 * can drift. It is also drawn at 1x and scaled by whole numbers, which is the
 * only way a 16x16 sprite survives being blown up to 1200x630.
 *
 * Why there is a PNG encoder in here: the card has to be a raster — LinkedIn
 * will not render an SVG — and the alternative is a headless browser or a
 * native image library as a build dependency, for one static image. zlib is in
 * Node already, and a PNG is a header, one deflated block of scanlines and a
 * trailer. The font below is the same answer to the same question.
 *
 * Run: npm run build:og
 */

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* The card, and the palette it shares with the game. */
const WIDTH = 1200;
const HEIGHT = 630;
const INK = [0x16, 0x16, 0x2a];
const PAPER = [0xff, 0xff, 0xff];
const PINK = [0xff, 0x5e, 0xdb];
const CYAN = [0x4d, 0xd8, 0xff];
const SOFT = [0x61, 0x61, 0x7a];

/* ------------------------------------------------------------------ canvas -- */

/** A plain RGB framebuffer. Three bytes per pixel, row-major. */
function createCanvas(width, height, fill) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = fill[0];
    pixels[i * 3 + 1] = fill[1];
    pixels[i * 3 + 2] = fill[2];
  }
  return { width, height, pixels };
}

function fillRect(canvas, x, y, w, h, color) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(canvas.width, Math.round(x + w));
  const y1 = Math.min(canvas.height, Math.round(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const at = (py * canvas.width + px) * 3;
      canvas.pixels[at] = color[0];
      canvas.pixels[at + 1] = color[1];
      canvas.pixels[at + 2] = color[2];
    }
  }
}

/* -------------------------------------------------------------------- font -- */

/**
 * A 5x7 bitmap alphabet.
 *
 * Deliberately not Press Start 2P: rasterising a real font needs a font engine,
 * and every glyph the card uses is a capital, a digit or one of four marks.
 * Drawing them as 35 squares each is smaller than the dependency would be, and
 * it is the same kind of object as the logo it sits next to.
 */
const GLYPHS = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '#####|..#..|..#..|..#..|..#..|..#..|#####',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#...#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#...#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '#####|...#.|..#..|...#.|....#|#...#|.###.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.',
  7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '.': '.....|.....|.....|.....|.....|.##..|.##..',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '-': '.....|.....|.....|#####|.....|.....|.....',
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};

const GLYPH_W = 5;

/** Width in pixels of `text` drawn at `scale`, one blank column between glyphs. */
function textWidth(text, scale) {
  return text.length * (GLYPH_W + 1) * scale - scale;
}

function drawText(canvas, text, x, y, scale, color) {
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const rows = (GLYPHS[char] ?? GLYPHS[' ']).split('|');
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === '#') {
          fillRect(canvas, cursor + rx * scale, y + ry * scale, scale, scale, color);
        }
      }
    });
    cursor += (GLYPH_W + 1) * scale;
  }
}

/* -------------------------------------------------------------------- logo -- */

/**
 * The logo, read out of its own SVG.
 *
 * The sprite is a list of axis-aligned rects on a 16x16 grid, which is exactly
 * a bitmap written in XML: parsing it back is a dozen lines and means the card
 * can never show a logo the site does not.
 */
function readLogo() {
  const svg = readFileSync(join(root, 'assets', 'logo.svg'), 'utf8');
  const grid = Array.from({ length: 16 }, () => Array(16).fill(null));
  const rect = /<rect\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"\s+fill="#([0-9a-fA-F]{6})"/g;

  let match;
  let count = 0;
  while ((match = rect.exec(svg)) !== null) {
    const [, xs, ys, ws, hs, hex] = match;
    const color = [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
    for (let y = Number(ys); y < Number(ys) + Number(hs); y++) {
      for (let x = Number(xs); x < Number(xs) + Number(ws); x++) {
        if (grid[y] && x < 16) grid[y][x] = color;
      }
    }
    count++;
  }

  if (count === 0) throw new Error('assets/logo.svg: no <rect> matched — has the sprite changed?');
  return grid;
}

function drawLogo(canvas, grid, x, y, scale) {
  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < 16; gx++) {
      const color = grid[gy][gx];
      if (color) fillRect(canvas, x + gx * scale, y + gy * scale, scale, scale, color);
    }
  }
}

/* --------------------------------------------------------------------- png -- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Truecolour, 8 bits per channel, no filtering — the image is flat colour. */
function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte per scanline. Filter 0 (None) compresses well here because
  // the image is large flat areas, and it keeps this function readable.
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------- card --- */

const canvas = createCanvas(WIDTH, HEIGHT, PAPER);

// Frame, drawn as four bars so the corners stay square at this size.
const BORDER = 10;
fillRect(canvas, 0, 0, WIDTH, BORDER, INK);
fillRect(canvas, 0, HEIGHT - BORDER, WIDTH, BORDER, INK);
fillRect(canvas, 0, 0, BORDER, HEIGHT, INK);
fillRect(canvas, WIDTH - BORDER, 0, BORDER, HEIGHT, INK);

// Two thin rules inside it, in the logo's own two colours.
fillRect(canvas, BORDER, BORDER, WIDTH - BORDER * 2, 6, PINK);
fillRect(canvas, BORDER, HEIGHT - BORDER - 6, WIDTH - BORDER * 2, 6, CYAN);

drawLogo(canvas, readLogo(), 96, 155, 20);

const TEXT_X = 500;
drawText(canvas, 'FINGERTUNE', TEXT_X, 170, 9, INK);
drawText(canvas, 'A RHYTHM GAME YOU PLAY', TEXT_X, 275, 4, INK);
drawText(canvas, 'BY PINCHING YOUR FINGERS', TEXT_X, 315, 4, INK);
drawText(canvas, 'WEBCAM ONLY - NOTHING LEAVES', TEXT_X, 375, 3, SOFT);
drawText(canvas, 'YOUR BROWSER', TEXT_X, 405, 3, SOFT);

const url = 'QTHULLIE.GITHUB.IO/FINGERTUNE';
drawText(canvas, url, WIDTH - 70 - textWidth(url, 3), 500, 3, PINK);

const out = join(root, 'public', 'og.png');
writeFileSync(out, encodePng(canvas));
console.log(`[fingertune] wrote ${out} (${WIDTH}x${HEIGHT})`);
