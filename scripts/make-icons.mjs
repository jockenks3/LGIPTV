// Generates public/icon.png (80x80) and public/largeIcon.png (130x130) without any
// image dependencies (own PNG encoder). The artwork is original (no third-party logos).
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const table = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inRoundRect(x, y, r) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
}
function inTri(px, py, a, b, c) {
  const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [px, py];
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function sample(x, y) {
  if (!inRoundRect(x, y, 0.22)) return [0, 0, 0, 0];
  const t = (x + y) / 2;
  let col = [59 + (124 - 59) * t, 130 + (58 - 130) * t, 246 + (237 - 246) * t];
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (Math.abs(d - 0.31) < 0.022) col = [255, 255, 255];
  if (inTri(x, y, [0.43, 0.35], [0.43, 0.65], [0.67, 0.5])) col = [255, 255, 255];
  return [col[0], col[1], col[2], 255];
}

function render(size) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      const o = (y * size + x) * 4;
      if (a > 0) {
        buf[o] = Math.round(r / a); buf[o + 1] = Math.round(g / a); buf[o + 2] = Math.round(b / a);
        buf[o + 3] = Math.round(a / (ss * ss));
      }
    }
  }
  return encodePng(size, size, buf);
}

const pub = path.resolve("public");
fs.mkdirSync(pub, { recursive: true });
fs.writeFileSync(path.join(pub, "icon.png"), render(80));
fs.writeFileSync(path.join(pub, "largeIcon.png"), render(130));
console.log("icons written to public/icon.png (80x80) and public/largeIcon.png (130x130)");
