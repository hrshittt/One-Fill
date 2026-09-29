// Renders the One-Fill icon to PNG at 16/32/48/128 px without any image dependencies.
// The design mirrors logoMark() in src/ui/icons.ts: a gradient rounded square with two
// "form field" lines and a check mark, drawn with signed-distance functions and 4×4 supersampling.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets', 'icons');
const SIZES = [16, 32, 48, 128];

const FROM = [0x63, 0x66, 0xf1];
const TO = [0x8b, 0x5c, 0xf6];

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function strokeCoverage(px, py, segments, width) {
  let d = Infinity;
  for (const [ax, ay, bx, by] of segments) d = Math.min(d, distToSegment(px, py, ax, ay, bx, by));
  return d <= width / 2;
}

function render(size) {
  const small = size <= 16;
  // Design space is 32×32 units.
  const lines = small ? [] : [[9, 11, 18, 11], [9, 16, 15, 16]];
  const check = small ? [[9.5, 16.5, 14, 21], [14, 21, 23, 11]] : [[15.5, 21.2, 18.6, 24.2], [18.6, 24.2, 25, 17]];
  const checkWidth = small ? 4.2 : 2.8;
  const lineWidth = 2.4;
  const radius = small ? 7.5 : 9;

  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  const scale = 32 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) / samples) * scale;
          const py = (y + (sy + 0.5) / samples) * scale;
          if (sdRoundRect(px, py, 16, 16, 16, 16, radius) > 0) continue;
          const t = Math.max(0, Math.min(1, (px + py) / 64));
          let cr = FROM[0] + (TO[0] - FROM[0]) * t;
          let cg = FROM[1] + (TO[1] - FROM[1]) * t;
          let cb = FROM[2] + (TO[2] - FROM[2]) * t;
          if (lines.length && strokeCoverage(px, py, lines, lineWidth)) {
            cr += (255 - cr) * 0.55;
            cg += (255 - cg) * 0.55;
            cb += (255 - cb) * 0.55;
          }
          if (strokeCoverage(px, py, check, checkWidth)) cr = cg = cb = 255;
          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = samples * samples;
      const alpha = a / n;
      const i = (y * size + x) * 4;
      // Colours are averaged over covered samples only (straight alpha).
      const covered = a / 255;
      pixels[i] = covered ? Math.round(r / covered) : 0;
      pixels[i + 1] = covered ? Math.round(g / covered) : 0;
      pixels[i + 2] = covered ? Math.round(b / covered) : 0;
      pixels[i + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, pixels);
}

// ── Minimal PNG encoder ──────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  const file = path.join(outDir, `icon-${size}.png`);
  await writeFile(file, render(size));
  console.log(`[icons] wrote ${path.relative(root, file)}`);
}
