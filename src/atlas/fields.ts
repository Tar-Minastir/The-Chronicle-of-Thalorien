/**
 * Terrain fields: turns the atlas features (polygons, ridgelines) into continuous scalar fields on a
 * coarse grid: elevation, sea, forest density, and biome masks. Pure and deterministic; no DOM.
 * The painters (paint.ts) sample these to draw the raster map, and the live tree-detail pass samples
 * `forest` so that close-up trees appear exactly where the painted woods are.
 */
import type { AtlasFeature, XY } from './geography';

/** Grid nodes per side; the grid spans the 0..1000 world with 2-unit cells. */
export const GRID = 501;
export const CELL = 2;

export interface Fields {
  /** Elevation, about -1 (deep sea) .. 1 (high peaks). */
  elev: Float32Array;
  /** Signed distance into the sea in world units (> 0 = water). */
  sea: Float32Array;
  /** Tree cover 0..1. */
  forest: Float32Array;
  /** Forest character at each node: 0 open woodland, 1 green, 2 silver, 3 fire-scarred. */
  tone: Uint8Array;
  fen: Float32Array;
  waste: Float32Array;
  ice: Float32Array;
  heath: Float32Array;
}

// ---------------------------------------------------------------- noise

export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1. */
export function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x, y, seed + i * 17);
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Ridged noise, 0..1, with sharp crests: the look of eroded mountain spines. */
export function ridged(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(2 * vnoise(x, y, seed + i * 31) - 1);
    sum += amp * n * n;
    norm += amp;
    x *= 2.1;
    y *= 2.1;
    amp *= 0.5;
  }
  return sum / norm;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- geometry

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? clamp01(((px - ax) * dx + (py - ay) * dy) / len) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function lineDist(px: number, py: number, pts: XY[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return best;
}

/** Signed distance to a closed polygon: positive inside. */
export function polySigned(px: number, py: number, pts: XY[]): number {
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    best = Math.min(best, segDist(px, py, ax, ay, bx, by));
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? best : -best;
}

interface Prepared {
  f: AtlasFeature;
  pts: XY[];
  box: [number, number, number, number];
}

function prepare(features: AtlasFeature[], margin: (f: AtlasFeature) => number): Prepared[] {
  return features
    .filter((f) => f.shape.kind !== 'point')
    .map((f) => {
      const pts = (f.shape as { points: XY[] }).points;
      const m = margin(f);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return { f, pts, box: [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m] as Prepared['box'] };
    });
}
const inBox = (p: Prepared, x: number, y: number) => x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3];

const TONE = { green: 1, silver: 2, scarred: 3 } as const;

// ---------------------------------------------------------------- field construction

export function buildFields(features: AtlasFeature[]): Fields {
  const n = GRID * GRID;
  const out: Fields = {
    elev: new Float32Array(n), sea: new Float32Array(n), forest: new Float32Array(n), tone: new Uint8Array(n),
    fen: new Float32Array(n), waste: new Float32Array(n), ice: new Float32Array(n), heath: new Float32Array(n),
  };
  const of = (t: AtlasFeature['type'][]) => features.filter((f) => t.includes(f.type));
  const ranges = prepare(of(['mountains', 'hills']), (f) => (f.width ?? 30) * 2.6 + 30);
  const seas = prepare(of(['sea']), () => 60);
  const forests = prepare(of(['forest']), () => 50);
  const masks: [keyof Pick<Fields, 'fen' | 'waste' | 'ice' | 'heath'>, Prepared[]][] = [
    ['fen', prepare(of(['fen']), () => 40)], ['waste', prepare(of(['waste']), () => 40)],
    ['ice', prepare(of(['ice']), () => 40)], ['heath', prepare(of(['heath']), () => 40)],
  ];

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = gy * GRID + gx;
      const x = gx * CELL;
      const y = gy * CELL;
      // Domain warp: shapes are authored as plain polygons; warping the lookup gives them natural, irregular edges.
      const wx = x + (fbm(x / 90, y / 90, 11) - 0.5) * 44;
      const wy = y + (fbm(x / 90, y / 90, 23) - 0.5) * 44;
      const fine = (fbm(x / 20, y / 20, 5) - 0.5) * 22;

      let sea = -1e9;
      for (const s of seas) sea = Math.max(sea, inBox(s, wx, wy) ? polySigned(wx, wy, s.pts) : -60);
      sea += fine * 0.35;
      out.sea[i] = sea;

      let e = 0.07 + 0.11 * fbm(x / 170, y / 170, 3);
      for (const r of ranges) {
        if (!inBox(r, wx, wy)) continue;
        const w = r.f.width ?? 30;
        const h = r.f.height ?? 0.5;
        const d = lineDist(wx, wy, r.pts);
        const core = clamp01(1 - d / w);
        const skirt = clamp01(1 - d / (w * 2.5));
        e += r.f.type === 'mountains'
          ? h * (0.66 * Math.pow(core, 1.35) * (0.5 + 0.5 * ridged(x / 30, y / 30, 41)) + 0.2 * skirt * skirt)
          : h * (0.55 * core * (0.55 + 0.45 * fbm(x / 34, y / 34, 43)) + 0.22 * skirt * skirt);
      }
      e = Math.min(e, 1);

      for (const [key, list] of masks) {
        let v = 0;
        for (const m of list) if (inBox(m, wx, wy)) v = Math.max(v, smoothstep(-8, 10, polySigned(wx, wy, m.pts) + fine * 0.5));
        out[key][i] = v;
      }

      let forest = 0;
      let tone = 0;
      for (const f of forests) {
        if (!inBox(f, wx, wy)) continue;
        const v = smoothstep(-9, 13, polySigned(wx, wy, f.pts) + fine);
        if (v > forest) {
          forest = v;
          tone = TONE[f.f.tone ?? 'green'];
        }
      }
      const open = (1 - out.fen[i]) * (1 - out.waste[i]) * (1 - out.ice[i]);
      // Scattered groves across the lowlands, so that woods thin out into open country instead of stopping at a line.
      const groves = smoothstep(0.5, 0.7, fbm(x / 70, y / 70, 71)) * 0.6 * (1 - smoothstep(0.2, 0.36, e)) * open * (1 - 0.7 * out.heath[i]);
      if (groves > forest) {
        forest = groves;
        tone = 0;
      }
      forest *= (1 - smoothstep(0.36, 0.52, e)) * (0.25 + 0.75 * open);

      if (sea > 0) {
        e = -clamp01(sea / 70);
        forest = 0;
      } else if (sea > -5) {
        forest *= (-sea) / 5;
      }
      out.elev[i] = e;
      out.forest[i] = forest;
      out.tone[i] = tone;
    }
  }
  return out;
}

/** Bilinear sample of a field at world coordinates. */
export function sample(grid: Float32Array, x: number, y: number): number {
  const fx = Math.min(Math.max(x / CELL, 0), GRID - 1.001);
  const fy = Math.min(Math.max(y / CELL, 0), GRID - 1.001);
  const ix = fx | 0;
  const iy = fy | 0;
  const u = fx - ix;
  const v = fy - iy;
  const i = iy * GRID + ix;
  return (grid[i] * (1 - u) + grid[i + 1] * u) * (1 - v) + (grid[i + GRID] * (1 - u) + grid[i + GRID + 1] * u) * v;
}

export function toneAt(f: Fields, x: number, y: number): number {
  const ix = Math.min(Math.max(Math.round(x / CELL), 0), GRID - 1);
  const iy = Math.min(Math.max(Math.round(y / CELL), 0), GRID - 1);
  return f.tone[iy * GRID + ix];
}
