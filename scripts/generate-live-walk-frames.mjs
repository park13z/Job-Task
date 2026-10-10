/**
 * Generate 12 complete, transparent PNG frames for each of the three Live
 * characters. This is an asset-authoring utility, never shipped to the client.
 *
 * IMPORTANT: the source sheet contains ONE pose per actor, not a rig.
 * We preserve its head, torso and equipment unaltered; below the fixed hip
 * seam we replace the old legs with newly rasterized two-segment legs whose
 * upper joints are anchored to the body in every frame.
 *
 * Usage: node scripts/generate-live-walk-frames.mjs --write
 *        node scripts/generate-live-walk-frames.mjs --check
 */
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/features/live-animation/live-worker-sheet.png", import.meta.url);
const DEST = new URL("../src/features/live-animation/frames/", import.meta.url);
const N = 12;
const W = 103, H = 80;
const TWOPI = Math.PI * 2;

// Sprite-specific hip points and palette: source cell coordinates in pixels.
// Source objects occupy different x ranges; never erase or animate the props.
const characters = [
  {
    name: "crate-carrier",
    hip: [[34, 59], [51, 59]], cutY: 61, eraseX: [19, 69],
    outline: "#3a3540", pants: ["#394862", "#2c354a"],
    highlight: "#56627a", boot: "#875644", sole: "#513c39",
    propBounds: [61, 34, 99, 65],
  },
  {
    name: "cart-pusher",
    hip: [[19, 60], [37, 60]], cutY: 64, eraseX: [7, 47],
    outline: "#3b3440", pants: ["#73736a", "#5b625d"],
    highlight: "#978673", boot: "#935b46", sole: "#563d37",
    propBounds: [48, 26, 102, 80],
  },
  {
    name: "clipboard-checker",
    hip: [[37, 60], [53, 60]], cutY: 64, eraseX: [20, 79],
    outline: "#343342", pants: ["#34455a", "#273648"],
    highlight: "#52657b", boot: "#9b6047", sole: "#5e4239",
    propBounds: [59, 32, 96, 64],
  },
];

const rgba = (color, alpha = 255) => {
  const value = color.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), alpha];
};
const index = (x, y) => (y * W + x) * 4;
function dot(buffer, x, y, color) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = index(x, y);
  const alpha = color[3] / 255;
  if (alpha >= 1) {
    buffer[i] = color[0]; buffer[i + 1] = color[1]; buffer[i + 2] = color[2]; buffer[i + 3] = 255;
    return;
  }
  const old = buffer[i + 3] / 255;
  const out = alpha + old * (1 - alpha);
  if (out < 0.0001) return;
  for (let c = 0; c < 3; c++) buffer[i + c] = Math.round((color[c] * alpha + buffer[i + c] * old * (1 - alpha)) / out);
  buffer[i + 3] = Math.round(out * 255);
}
function ellipse(buf, cx, cy, rx, ry, col) {
  const x1 = Math.max(0, Math.floor(cx - rx)), x2 = Math.min(W - 1, Math.ceil(cx + rx));
  const y1 = Math.max(0, Math.floor(cy - ry)), y2 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
    if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) dot(buf, x, y, col);
  }
}
function line(buf, a, b, thickness, color) {
  const x1 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - thickness));
  const x2 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + thickness));
  const y1 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - thickness));
  const y2 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + thickness));
  const dx = b[0] - a[0], dy = b[1] - a[1], lenSq = dx * dx + dy * dy;
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
    const p = [x + 0.5, y + 0.5];
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
    if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) <= thickness) dot(buf, x, y, color);
  }
}
function fillPoly(buf, points, color) {
  const minX = Math.max(0, Math.floor(Math.min(...points.map(p => p[0]))));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(...points.map(p => p[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(...points.map(p => p[1]))));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j], yy = y + 0.5, xx = x + 0.5;
      if ((a[1] > yy) !== (b[1] > yy) && xx < (b[0] - a[0]) * (yy - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) dot(buf, x, y, color);
  }
}
function drawLeg(buf, cfg, leg, phase) {
  const [hx, hy] = cfg.hip[leg];
  const advance = Math.cos(phase);
  const airborne = Math.max(0, Math.sin(phase));
  // Both thighs START AT THE SAME, FIXED HIP ANCHOR in every frame.
  // Knee follows at most 4 px; the ankle follows up to 10 px.
  const knee = [hx + 3.8 * advance, hy + 7.2 - airborne * 1.5];
  const ankle = [hx + 9.1 * advance, 72.3 - airborne * 5.5];
  const hip = [hx, hy - 1.8];
  const pants = rgba(cfg.pants[leg]), ink = rgba(cfg.outline);
  const accent = rgba(cfg.highlight);
  const boot = rgba(cfg.boot), sole = rgba(cfg.sole);
  // Upper thigh, knee and shin are ONE continuous two-segment limb.
  line(buf, hip, knee, 5.8, ink);
  line(buf, knee, ankle, 5.2, ink);
  line(buf, hip, knee, 4.65, pants);
  line(buf, knee, ankle, 3.8, pants);
  line(buf, [hip[0] - 1, hip[1] + 1], [knee[0] - 1, knee[1] - 1], 1.0, accent);
  ellipse(buf, knee[0], knee[1], 4, 3.6, pants);
  // A complete, shaded boot, attached to ankle; airborne foot has no shadow.
  const toe = advance >= 0 ? 1 : -1;
  const soleY = ankle[1] + 5;
  fillPoly(buf, [
    [ankle[0] - 4.2, ankle[1] - 1.2], [ankle[0] + 4.1, ankle[1] - 1.5],
    [ankle[0] + 5.5 * toe, soleY - 1], [ankle[0] + 5.8 * toe + 3, soleY + 1],
    [ankle[0] - 4.5, soleY + 1], [ankle[0] - 5, ankle[1] + 2],
  ], ink);
  ellipse(buf, ankle[0] + toe * 1.3, ankle[1] + 2, 5.25, 3.3, boot);
  line(buf, [ankle[0] - 4, soleY], [ankle[0] + 5, soleY], 0.9, sole);
  return { hip, knee, ankle };
}
function sourcePixel(src, character, x, y) {
  const i = (y * 309 + character * W + x) * 4;
  return src.subarray(i, i + 4);
}
function footConnectsToHip(buffer, ankle, hip) {
  const seen = new Uint8Array(W * H);
  const queue = new Uint16Array(W * H);
  const occupied = (x, y) => x >= 0 && y >= 0 && x < W && y < H
    && buffer[index(x, y) + 3] >= 135;
  const startX = Math.round(ankle[0]);
  const startY = Math.round(ankle[1] + 1);
  let start = null;
  for (let radius = 0; radius <= 4 && start === null; radius++) {
    for (let dy = -radius; dy <= radius && start === null; dy++)
      for (let dx = -radius; dx <= radius && start === null; dx++) {
        if (occupied(startX + dx, startY + dy)) start = (startY + dy) * W + startX + dx;
      }
  }
  if (start === null) return false;
  let head = 0, tail = 1;
  queue[0] = start;
  seen[start] = 1;
  while (head < tail) {
    const v = queue[head++], x = v % W, y = Math.floor(v / W);
    if (Math.abs(x - hip[0]) <= 5 && y <= hip[1] - 1 && y >= hip[1] - 5) return true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (occupied(nx, ny) && !seen[n]) { seen[n] = 1; queue[tail++] = n; }
    }
  }
  return false;
}

function buildFrame(src, characterIndex, frameIndex) {
  const cfg = characters[characterIndex];
  const out = Buffer.alloc(W * H * 4);
  // A soft ground shadow stays underneath both feet; doesn't animate props.
  ellipse(out, (cfg.hip[0][0] + cfg.hip[1][0]) / 2, 77.6, 18, 1.35, [41, 48, 60, 42]);
  const phase = frameIndex * TWOPI / N;
  const first = Math.sin(phase) >= 0 ? 1 : 0; // farther leg first
  const gait = Array(2);
  gait[first] = drawLeg(out, cfg, first, phase + first * Math.PI);
  gait[1 - first] = drawLeg(out, cfg, 1 - first, phase + (1 - first) * Math.PI);
  // The source body and objects are composited AFTER the legs, hiding their
  // fixed joints under original shirt/shorts while leaving every prop intact.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const eraseOldLegs = y >= cfg.cutY && x >= cfg.eraseX[0] && x <= cfg.eraseX[1];
    const inProp = x >= cfg.propBounds[0] && x < cfg.propBounds[2]
      && y >= cfg.propBounds[1] && y < cfg.propBounds[3];
    if (eraseOldLegs && !inProp) continue;
    const px = sourcePixel(src, characterIndex, x, y);
    // Foreground props are exact immutable source pixels, including soft edges.
    if (inProp) { px.copy(out, index(x, y)); continue; }
    if (px[3] > 0) dot(out, x, y, px);
  }
  // Invariant: top of both animated thigh columns must touch original torso.
  for (const [hx, hy] of cfg.hip) {
    let connected = false;
    for (let y = hy - 3; y <= hy + 5; y++) {
      for (let x = hx - 4; x <= hx + 4; x++) if (out[index(x, y) + 3] >= 170) connected = true;
    }
    if (!connected) throw Error("A hip detached in " + cfg.name + " frame " + frameIndex);
  }
  for (let leg = 0; leg < 2; leg++) {
    if (!footConnectsToHip(out, gait[leg].ankle, gait[leg].hip)) {
      throw Error("Foot-to-hip silhouette disconnected in " + cfg.name + " frame " + frameIndex + " leg " + leg);
    }
  }
  // Original equipment pixels must be identical across all frames.
  for (let y = cfg.propBounds[1]; y < cfg.propBounds[3]; y++) {
    for (let x = cfg.propBounds[0]; x < cfg.propBounds[2]; x++) {
      const base = sourcePixel(src, characterIndex, x, y), i = index(x, y);
      if (base[3] >= 220 && (out[i] !== base[0] || out[i + 1] !== base[1] || out[i + 2] !== base[2] || out[i + 3] !== base[3])) {
        throw Error("Equipment changed " + cfg.name + " frame " + frameIndex + " at " + x + "," + y);
      }
    }
  }
  return { out, gait };
}
async function main() {
  const mode = process.argv[2] ?? "--check";
  if (!["--check", "--write"].includes(mode)) throw Error("Use --write or --check");
  const { data: src, info } = await sharp(fileURLToPath(SRC)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 309 || info.height !== 80 || info.channels !== 4) throw Error("Unexpected source sheet dimensions");
  if (mode === "--write") await mkdir(fileURLToPath(DEST), { recursive: true });
  let total = 0;
  for (let c = 0; c < characters.length; c++) {
    const frames = [];
    const stridePoints = [];
    for (let f = 0; f < N; f++) {
      const { out, gait } = buildFrame(src, c, f);
      frames.push(out);
      stridePoints.push(gait.map(v => ({ hip: v.hip, ankle: v.ankle })));
    }
    const strip = Buffer.alloc(W * N * H * 4);
    for (let y = 0; y < H; y++) for (let f = 0; f < N; f++) {
      frames[f].copy(strip, (y * W * N + f * W) * 4, y * W * 4, (y + 1) * W * 4);
    }
    const png = await sharp(strip, { raw: { width: W * N, height: H, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toBuffer();
    const file = new URL(characters[c].name + ".png", DEST);
    if (mode === "--write") await writeFile(fileURLToPath(file), png);
    else {
      // Compare actual RGBA pixels, not PNG compression bytes, so a patch
      // update of libvips does not flag an unchanged illustration.
      const { data: existing, info: existingInfo } = await sharp(fileURLToPath(file))
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (existingInfo.width !== W * N || existingInfo.height !== H || !existing.equals(strip)) {
        throw Error("Generated sheet is out of date: " + characters[c].name);
      }
    }
    total += png.length;
    console.log(characters[c].name + ": " + N + " connected complete frames, equipment unchanged; " + png.length + " bytes");
  }
  console.log((mode === "--write" ? "WROTE" : "VERIFIED") + " 3 sprite strips (" + total + " bytes)");
}
await main();
