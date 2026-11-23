/**
 * Raster painters for the base geography (rendering system 1 of 3).
 *
 * The world is painted once into a few large bitmaps — ground (shaded relief, biomes, sea), forests
 * (floor tint + overlapping canopies), mountains (illustrated peaks along the ridgelines), waters (rivers
 * and lakes) and sky (edge clouds) — which are then simply scaled onto the screen as the camera moves.
 * One bitmap per layer keeps every layer independently toggleable. When zoomed in, `drawTreeDetail`
 * adds crisp individual trees for the visible area only.
 *
 * `shadeGround` is pure (arrays in, pixels out) and is unit-tested; the canvas painters are thin.
 */
import { clamp01, fbm, hash2, ridged, sample, smoothstep, toneAt, vnoise, buildFields, type Fields } from './fields';
import type { AtlasFeature, XY } from './geography';

export const WORLD = 1000;
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Shaded-relief ground colour for every pixel of an R×R bitmap. Returns RGBA bytes. */
export function shadeGround(f: Fields, R: number): Uint8ClampedArray {
  const k = R / WORLD;
  const E = new Float32Array(R * R);
  for (let py = 0; py < R; py++) {
    const y = py / k;
    for (let px = 0; px < R; px++) {
      const x = px / k;
      const e = sample(f.elev, x, y);
      const m = smoothstep(0.2, 0.5, e);
      E[py * R + px] = e + m * 0.11 * (ridged(x / 11, y / 11, 91, 2) - 0.45) + 0.012 * (vnoise(x / 4, y / 4, 93) - 0.5)
        // Gentle swells everywhere, so the lowlands catch the light like rolling country rather than a flat wash.
        + (e > 0 ? 0.05 * (fbm(x / 36, y / 36, 95, 3) - 0.5) : 0);
    }
  }
  const out = new Uint8ClampedArray(R * R * 4);
  for (let py = 0; py < R; py++) {
    const y = py / k;
    const north = 1 - y / WORLD;
    for (let px = 0; px < R; px++) {
      const x = px / k;
      const i = py * R + px;
      const e = E[i];
      const sea = sample(f.sea, x, y);
      const fine = vnoise(x / 6, y / 6, 9);
      let c: RGB;
      if (sea > 0) {
        c = mix([108, 170, 172], [40, 84, 116], Math.pow(clamp01(sea / 55), 0.6));
        const wave = (vnoise(x / 5, y / 2.2, 77) - 0.5) * 12;
        c = [c[0] + wave, c[1] + wave, c[2] + wave];
        if (sea < 1.6) c = mix(c, [226, 238, 232], 0.7 * (1 - sea / 1.6));
        else if (sea > 5 && sea < 6.4) c = mix(c, [226, 238, 232], 0.22);
      } else {
        const g = fbm(x / 55, y / 55, 7, 3);
        const broad = fbm(x / 210, y / 210, 8, 3);
        c = mix([92, 116, 64], [146, 152, 90], g);
        // Broad swings between lush pasture and pale, sun-bleached meadow keep the open country from reading as one flat green.
        c = mix(c, [184, 174, 112], smoothstep(0.5, 0.76, broad) * 0.62);
        c = mix(c, [76, 104, 60], smoothstep(0.5, 0.24, broad) * 0.5);
        c = [c[0] + (fine - 0.5) * 12, c[1] + (fine - 0.5) * 12, c[2] + (fine - 0.5) * 8];
        c = mix(c, [150, 140, 94], smoothstep(0.2, 0.38, e));
        c = mix(c, [128, 114, 100], smoothstep(0.36, 0.56, e));
        c = mix(c, [164, 156, 150], smoothstep(0.6, 0.86, e));
        const heath = sample(f.heath, x, y);
        if (heath > 0.01) c = mix(c, mix([122, 100, 112], [146, 122, 104], g), heath * 0.62);
        const waste = sample(f.waste, x, y);
        if (waste > 0.01) c = mix(c, vnoise(x / 3, y / 3, 51) > 0.68 ? [92, 84, 78] : [128, 116, 106], waste * 0.85);
        const fen = sample(f.fen, x, y);
        if (fen > 0.01) c = mix(c, fen > 0.4 && vnoise(x / 9, y / 9, 55) < 0.34 ? [88, 138, 150] : [84, 112, 84], fen * 0.85);
        const snowline = 0.62 - 0.23 * north;
        c = mix(c, [240, 243, 247], smoothstep(snowline, snowline + 0.09, e + (fine - 0.5) * 0.05));
        const ice = sample(f.ice, x, y);
        if (ice > 0.01) c = mix(c, ridged(x / 14, y / 14, 61, 2) > 0.7 ? [150, 190, 214] : [218, 233, 241], ice * 0.92);
        if (sea > -2.6) c = mix(c, [202, 186, 142], smoothstep(-2.6, -0.6, sea));
        // Hill-shading: light from the north-west.
        const dx = px > 0 && px < R - 1 ? (E[i + 1] - E[i - 1]) * k * 0.5 : 0;
        const dy = py > 0 && py < R - 1 ? (E[i + R] - E[i - R]) * k * 0.5 : 0;
        const lam = 1 + Math.max(-0.5, Math.min(0.42, (dx + dy) * 9));
        c = [c[0] * lam, c[1] * lam, c[2] * lam];
        if (sea > -0.7) c = [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7];
      }
      const grain = 0.95 + 0.1 * hash2(px, py, 1);
      // The painted world ends in a soft, irregular edge so the parchment shows around it.
      const edge = Math.min(x, y, WORLD - x, WORLD - y) + (vnoise(x / 18, y / 18, 13) - 0.5) * 14;
      const o = i * 4;
      out[o] = c[0] * grain;
      out[o + 1] = c[1] * grain;
      out[o + 2] = c[2] * grain;
      out[o + 3] = 255 * smoothstep(2, 16, edge);
    }
  }
  return out;
}

// ---------------------------------------------------------------- canvas painters

const FLOOR: RGB[] = [[62, 90, 50], [36, 62, 34], [56, 84, 66], [86, 86, 58]];
const CANOPY: RGB[][] = [
  [[86, 124, 62], [102, 138, 70], [74, 112, 56]],
  [[52, 94, 46], [66, 110, 52], [44, 80, 40], [80, 120, 58]],
  [[92, 130, 102], [116, 148, 120], [78, 112, 92], [140, 166, 140]],
  [[108, 116, 72], [126, 122, 82], [90, 102, 62], [98, 118, 66]],
];
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function newCanvas(R: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = R;
  return [c, c.getContext('2d')!];
}

function canopy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: RGB) {
  ctx.fillStyle = 'rgba(18,30,18,0.42)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.34, y + r * 0.46, r, r * 0.9, 0, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = rgb(col);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = rgb([col[0] + 46, col[1] + 46, col[2] + 22], 0.62);
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.58, 0, 6.2832);
  ctx.fill();
}

function canopyColour(tone: number, dens: number, h: number): RGB | null {
  if (tone === 3) {
    if (h < 0.2) return null; // bare, burnt ground
    if (h < 0.31) return [146, 136, 118]; // dead standing timber
  }
  const pal = CANOPY[tone];
  const c = pal[Math.floor(h * 997) % pal.length];
  const b = 1.1 - 0.24 * dens;
  return [c[0] * b, c[1] * b, c[2] * b];
}

function paintForests(f: Fields, R: number): HTMLCanvasElement {
  const [c, ctx] = newCanvas(R);
  // Forest floor: a dark wash under the canopies so that gaps read as deep wood, not as meadow.
  const S = R >> 1;
  const [fc, fctx] = newCanvas(S);
  const img = fctx.createImageData(S, S);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const x = (px / S) * WORLD;
      const y = (py / S) * WORLD;
      const d = sample(f.forest, x, y);
      const t = toneAt(f, x, y);
      const o = (py * S + px) * 4;
      img.data[o] = FLOOR[t][0];
      img.data[o + 1] = FLOOR[t][1];
      img.data[o + 2] = FLOOR[t][2];
      img.data[o + 3] = 255 * smoothstep(0.3, 0.85, d) * (t === 0 ? 0.35 : t === 3 ? 0.55 : 0.74);
    }
  }
  fctx.putImageData(img, 0, 0);
  ctx.drawImage(fc, 0, 0, R, R);

  const k = R / WORLD;
  const g = 5.6;
  for (let gy = 2; gy < WORLD / g - 2; gy++) {
    for (let gx = 2; gx < WORLD / g - 2; gx++) {
      const x = (gx + hash2(gx, gy, 201)) * g;
      const y = (gy + hash2(gx, gy, 202)) * g;
      const d = sample(f.forest, x, y);
      if (hash2(gx, gy, 203) >= Math.pow(d, 1.1)) continue;
      const col = canopyColour(toneAt(f, x, y), d, hash2(gx, gy, 204));
      if (!col) continue;
      canopy(ctx, x * k, y * k, (2.9 + 3.1 * hash2(gx, gy, 205)) * (0.72 + 0.5 * d) * k, col);
    }
  }
  return c;
}

interface Peak {
  x: number;
  y: number;
  h: number;
  snow: number;
  hill: boolean;
  seed: number;
}

function paintMountains(features: AtlasFeature[], f: Fields, R: number): HTMLCanvasElement {
  const [c, ctx] = newCanvas(R);
  const k = R / WORLD;
  const peaks: Peak[] = [];
  let seed = 0;
  for (const r of features) {
    if ((r.type !== 'mountains' && r.type !== 'hills') || r.shape.kind !== 'line') continue;
    const pts = r.shape.points;
    const w = r.width ?? 30;
    for (let s = 1; s < pts.length; s++) {
      const [ax, ay] = pts[s - 1];
      const [bx, by] = pts[s];
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      for (let d = 0; d < len; d += r.type === 'hills' ? 7 : 4.6) {
        for (let row = 0; row < 3; row++) {
          seed++;
          const t = (d + hash2(seed, 1, 301) * 5) / len;
          const off = (hash2(seed, 2, 302) - 0.5) * 2 * w * 0.78;
          const x = ax + (bx - ax) * t + nx * off;
          const y = ay + (by - ay) * t + ny * off;
          if (x < 12 || y < 14 || x > WORLD - 12 || y > WORLD - 8) continue;
          const e = sample(f.elev, x, y);
          if (e < (r.type === 'hills' ? 0.16 : 0.24) || sample(f.sea, x, y) > -3) continue;
          const hill = r.type === 'hills';
          const h = hill ? 4 + 13 * e * (0.7 + 0.6 * hash2(seed, 3, 303)) : (5 + 27 * clamp01(e)) * (0.65 + 0.7 * hash2(seed, 3, 303));
          const snowline = 0.62 - 0.23 * (1 - y / WORLD);
          peaks.push({ x, y, h, hill, seed, snow: hill ? 0 : clamp01((e - snowline + (r.snowy ? 0.2 : 0.02)) / 0.3) });
        }
      }
    }
  }
  // Rolling country: low rounded hills scattered over the higher parts of the open plains (illustrative ground texture).
  for (let gy = 1; gy < 44; gy++) {
    for (let gx = 1; gx < 44; gx++) {
      const x = (gx + hash2(gx, gy, 311)) * 22.5;
      const y = (gy + hash2(gx, gy, 312)) * 22.5;
      const e = sample(f.elev, x, y);
      if (e < 0.112 || e > 0.22 || hash2(gx, gy, 313) > 0.8) continue;
      if (sample(f.forest, x, y) > 0.45 || sample(f.sea, x, y) > -8 || sample(f.fen, x, y) + sample(f.ice, x, y) + sample(f.waste, x, y) > 0.2) continue;
      peaks.push({ x, y, h: 3 + 3.5 * hash2(gx, gy, 314), hill: true, seed: ++seed, snow: 0 });
    }
  }
  peaks.sort((a, b) => a.y - b.y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const p of peaks) {
    const x = p.x * k;
    const y = p.y * k;
    const h = p.h * k;
    const lean = (hash2(p.seed, 4, 304) - 0.4) * 0.3 * h;
    if (p.hill) {
      const w = h * 1.5;
      const grad = ctx.createLinearGradient(0, y - h, 0, y + h * 0.3);
      grad.addColorStop(0, 'rgba(168,166,104,0.95)');
      grad.addColorStop(0.6, 'rgba(134,140,86,0.8)');
      grad.addColorStop(1, 'rgba(120,130,80,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - w, y + h * 0.3);
      ctx.quadraticCurveTo(x - w * 0.5, y - h * 1.15, x, y - h);
      ctx.quadraticCurveTo(x + w * 0.55, y - h * 0.9, x + w, y + h * 0.3);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,74,48,0.3)';
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.quadraticCurveTo(x + w * 0.55, y - h * 0.9, x + w, y + h * 0.3);
      ctx.quadraticCurveTo(x + w * 0.3, y - h * 0.2, x, y - h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,54,34,0.4)';
      ctx.lineWidth = Math.max(0.7, k * 0.3);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.8, y - h * 0.2);
      ctx.quadraticCurveTo(x - w * 0.4, y - h * 1.1, x, y - h);
      ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.9, x + w * 0.8, y - h * 0.15);
      ctx.stroke();
      continue;
    }
    const A: XY = [x + lean * 0.3, y - h];
    const BL: XY = [x - h * 0.72, y + h * 0.08];
    const BR: XY = [x + h * 0.74, y + h * 0.08];
    const RF: XY = [x + lean, y + h * 0.16];
    const face = (pts: XY[], top: string, mid: string, bottom: string) => {
      const grad = ctx.createLinearGradient(0, A[1], 0, y + h * 0.16);
      grad.addColorStop(0, top);
      grad.addColorStop(0.68, mid);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
      ctx.closePath();
      ctx.fill();
    };
    face([A, BL, RF], 'rgba(204,190,166,1)', 'rgba(166,150,124,0.95)', 'rgba(140,134,100,0)');
    face([A, RF, BR], 'rgba(104,92,86,1)', 'rgba(86,78,74,0.92)', 'rgba(80,78,66,0)');
    if (p.snow > 0.05) {
      const s = 0.22 + 0.4 * p.snow;
      const on = (q: XY, t: number): XY => [A[0] + (q[0] - A[0]) * t, A[1] + (q[1] - A[1]) * t];
      const l = on(BL, s);
      const m = on(RF, s * 0.8);
      const r2 = on(BR, s * 0.9);
      ctx.fillStyle = 'rgba(246,248,251,0.97)';
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(l[0], l[1]);
      ctx.lineTo((l[0] + m[0]) / 2, (l[1] + m[1]) / 2 - h * 0.06);
      ctx.lineTo(m[0], m[1]);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(184,198,216,0.97)';
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(m[0], m[1]);
      ctx.lineTo((m[0] + r2[0]) / 2, (m[1] + r2[1]) / 2 - h * 0.05);
      ctx.lineTo(r2[0], r2[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(50,38,28,0.5)';
    ctx.lineWidth = Math.max(0.7, k * 0.32);
    ctx.beginPath();
    ctx.moveTo(x - h * 0.5, y - h * 0.22);
    ctx.lineTo(A[0], A[1]);
    ctx.lineTo(x + h * 0.52, y - h * 0.2);
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(A[0] + (RF[0] - A[0]) * 0.7, A[1] + (RF[1] - A[1]) * 0.7);
    ctx.stroke();
  }
  return c;
}

/** Smooth a polyline (Catmull-Rom) and give it a gentle meander that dies out at both ends. */
export function riverCourse(pts: XY[], id: string): XY[] {
  const seed = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const out: XY[] = [];
  const P = (i: number) => pts[Math.min(Math.max(i, 0), pts.length - 1)];
  const total = (pts.length - 1) * 8;
  for (let s = 0; s < pts.length - 1; s++) {
    const [p0, p1, p2, p3] = [P(s - 1), P(s), P(s + 1), P(s + 2)];
    for (let j = 0; j < 8; j++) {
      const t = j / 8;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const x = cr(p0[0], p1[0], p2[0], p3[0]);
      const y = cr(p0[1], p1[1], p2[1], p3[1]);
      const n = s * 8 + j;
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy) || 1;
      const taper = Math.min(1, n / 6, (total - n) / 6);
      const off = (vnoise(n / 3.1, seed, 401) - 0.5) * 9 * taper;
      out.push([x - (dy / len) * off, y + (dx / len) * off]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function paintWaters(features: AtlasFeature[], R: number): HTMLCanvasElement {
  const [c, ctx] = newCanvas(R);
  const k = R / WORLD;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const rivers = features.filter((x) => x.type === 'river' && x.shape.kind === 'line');
  // Lush banks: a soft dark-green margin so each river sits in a valley of its own.
  ctx.strokeStyle = 'rgba(52,84,44,0.2)';
  for (const r of rivers) {
    const course = riverCourse((r.shape as { points: XY[] }).points, r.id);
    for (const width of [9, 5]) {
      ctx.lineWidth = (r.width ?? 2) * width * k;
      ctx.beginPath();
      course.forEach((q, i) => (i ? ctx.lineTo(q[0] * k, q[1] * k) : ctx.moveTo(q[0] * k, q[1] * k)));
      ctx.stroke();
    }
  }
  const passes: [string, number, number][] = [['rgba(34,54,56,0.9)', 1, 2.2], ['rgb(92,150,174)', 1, 0], ['rgba(176,214,220,0.6)', 0.32, 0]];
  for (const [colour, scale, extra] of passes) {
    ctx.strokeStyle = colour;
    for (const r of rivers) {
      const course = riverCourse((r.shape as { points: XY[] }).points, r.id);
      const w = r.width ?? 2;
      for (let i = 1; i < course.length; i++) {
        ctx.lineWidth = (w * 1.7 * (0.35 + 0.65 * (i / course.length)) * scale) * k + extra;
        ctx.beginPath();
        ctx.moveTo(course[i - 1][0] * k, course[i - 1][1] * k);
        ctx.lineTo(course[i][0] * k, course[i][1] * k);
        ctx.stroke();
      }
    }
  }
  for (const l of features) {
    if (l.type !== 'lake' || l.shape.kind !== 'area') continue;
    const p = l.shape.points;
    const mid = (a: XY, b: XY): XY => [((a[0] + b[0]) / 2) * k, ((a[1] + b[1]) / 2) * k];
    const path = () => {
      ctx.beginPath();
      const start = mid(p[p.length - 1], p[0]);
      ctx.moveTo(start[0], start[1]);
      for (let i = 0; i < p.length; i++) {
        const m = mid(p[i], p[(i + 1) % p.length]);
        ctx.quadraticCurveTo(p[i][0] * k, p[i][1] * k, m[0], m[1]);
      }
      ctx.closePath();
    };
    const ys = p.map((q) => q[1] * k);
    const grad = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
    grad.addColorStop(0, 'rgb(118,172,186)');
    grad.addColorStop(1, 'rgb(62,116,146)');
    path();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(38,60,58,0.8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  return c;
}

function paintSky(R: number): HTMLCanvasElement {
  const [c, ctx] = newCanvas(R);
  const k = R / WORLD;
  const banks: XY[] = [[30, 40], [970, 950], [975, 30]];
  banks.forEach(([bx, by], b) => {
    for (let i = 0; i < 9; i++) {
      const x = (bx + (hash2(b, i, 501) - 0.5) * 150) * k;
      const y = (by + (hash2(b, i, 502) - 0.5) * 70) * k;
      const r = (22 + 34 * hash2(b, i, 503)) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(250,249,243,0.42)');
      g.addColorStop(0.6, 'rgba(250,249,243,0.18)');
      g.addColorStop(1, 'rgba(250,249,243,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fill();
    }
  });
  return c;
}

export interface AtlasRaster {
  size: number;
  fields: Fields;
  ground: HTMLCanvasElement;
  forests: HTMLCanvasElement;
  mountains: HTMLCanvasElement;
  waters: HTMLCanvasElement;
  sky: HTMLCanvasElement;
}

const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/** Paint all base-geography bitmaps. Yields to the browser between stages so the page stays responsive. */
export async function buildRaster(features: AtlasFeature[], R: number, onStage?: (stage: string) => void): Promise<AtlasRaster> {
  onStage?.('Surveying the land…');
  await breathe();
  const fields = buildFields(features);
  onStage?.('Laying the ground…');
  await breathe();
  const [ground, gctx] = newCanvas(R);
  const img = gctx.createImageData(R, R);
  img.data.set(shadeGround(fields, R));
  gctx.putImageData(img, 0, 0);
  onStage?.('Raising the mountains…');
  await breathe();
  const mountains = paintMountains(features, fields, R);
  onStage?.('Planting the forests…');
  await breathe();
  const forests = paintForests(fields, R);
  onStage?.('Tracing the rivers…');
  await breathe();
  const waters = paintWaters(features, R);
  return { size: R, fields, ground, forests, mountains, waters, sky: paintSky(R) };
}

export interface BaseLayers {
  terrain: boolean;
  forests: boolean;
  mountains: boolean;
  waters: boolean;
}

/**
 * Draw the base geography for the current camera. `s` is screen px per world unit; (ox, oy) is the
 * screen position of the world origin. Order: ground → waters → forests → mountains → trees → sky.
 */
export function drawBase(ctx: CanvasRenderingContext2D, raster: AtlasRaster, layers: BaseLayers, ox: number, oy: number, s: number, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  if (!layers.terrain) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const d = WORLD * s;
  ctx.drawImage(raster.ground, ox, oy, d, d);
  if (layers.waters) ctx.drawImage(raster.waters, ox, oy, d, d);
  if (layers.forests) ctx.drawImage(raster.forests, ox, oy, d, d);
  if (layers.mountains) ctx.drawImage(raster.mountains, ox, oy, d, d);
  if (layers.forests) drawTreeDetail(ctx, raster.fields, ox, oy, s, w, h);
  ctx.drawImage(raster.sky, ox, oy, d, d);
}

/** Level of detail: individual trees for the visible area, once the camera is close enough to tell them apart. */
export function treeSpacing(s: number): number | null {
  if (s < 2.6) return null;
  return s >= 4.7 ? 1.7 : s >= 3.1 ? 2.6 : 3.6;
}

export function drawTreeDetail(ctx: CanvasRenderingContext2D, f: Fields, ox: number, oy: number, s: number, w: number, h: number): number {
  const g = treeSpacing(s);
  if (g === null) return 0;
  const x0 = Math.max(2, Math.floor(-ox / s / g));
  const x1 = Math.min(Math.floor(WORLD / g) - 2, Math.ceil((w - ox) / s / g));
  const y0 = Math.max(2, Math.floor(-oy / s / g));
  const y1 = Math.min(Math.floor(WORLD / g) - 2, Math.ceil((h - oy) / s / g));
  const salt = Math.round(g * 10);
  let drawn = 0;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const x = (gx + hash2(gx, gy, 600 + salt)) * g;
      const y = (gy + hash2(gx, gy, 610 + salt)) * g;
      const d = sample(f.forest, x, y);
      if (hash2(gx, gy, 620 + salt) >= d * 0.92) continue;
      const col = canopyColour(toneAt(f, x, y), d, hash2(gx, gy, 630 + salt));
      if (!col) continue;
      canopy(ctx, ox + x * s, oy + y * s, (0.55 + 0.5 * hash2(gx, gy, 640 + salt)) * g * 0.5 * s, col);
      drawn++;
    }
  }
  return drawn;
}
