/**
 * Deterministic procedural placement for the illustrated layer. Pure functions:
 * the same key always yields the same drawing, so the atlas does not shimmer
 * between renders or reloads.
 */
import type { Point } from '../domain/types';

/** Small seeded PRNG (mulberry32). */
export function rng(key: string): () => number {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GlyphInstance {
  x: number;
  y: number;
  scale: number;
  variant: number;
}

/**
 * Scatter `count` glyphs in a disc, denser toward the middle, keeping a minimum spacing,
 * sorted north-to-south so nearer glyphs overlap farther ones like a drawn map.
 */
export function scatter(key: string, centre: Point, radius: number, count: number, variants = 2): GlyphInstance[] {
  const rand = rng(key);
  const out: GlyphInstance[] = [];
  const minGap = (radius * 1.5) / Math.sqrt(Math.max(count, 1));
  for (let tries = 0; out.length < count && tries < count * 12; tries++) {
    const r = radius * Math.pow(rand(), 0.7);
    const a = rand() * Math.PI * 2;
    const x = centre.x + Math.cos(a) * r;
    const y = centre.y + Math.sin(a) * r * 0.8;
    const scale = 0.8 + rand() * 0.5;
    const variant = Math.floor(rand() * variants);
    if (out.some((g) => Math.hypot(g.x - x, g.y - y) < minGap)) continue;
    out.push({ x, y, scale, variant });
  }
  return out.sort((p, q) => p.y - q.y);
}

/** A hand-drawn-looking wavy stroke through `centre`, optionally aimed at a point. Returns an SVG path. */
export function wavyPath(key: string, centre: Point, length: number, towards?: Point): string {
  const rand = rng(key);
  const angle = towards ? Math.atan2(towards.y - centre.y, towards.x - centre.x) : rand() * Math.PI;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const steps = 14;
  const phase = rand() * Math.PI * 2;
  const amp = length * 0.05;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps - 0.5) * length;
    const off = Math.sin(phase + i * 0.9) * amp * (0.6 + rand() * 0.6);
    const x = centre.x + dx * t - dy * off;
    const y = centre.y + dy * t + dx * off;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** A slightly bowed line through the given points, like a route inked freehand. */
export function routePath(key: string, points: Point[]): string {
  const rand = rng(key);
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const bow = (rand() - 0.5) * 0.18;
    const cx = (a.x + b.x) / 2 - (b.y - a.y) * bow;
    const cy = (a.y + b.y) / 2 + (b.x - a.x) * bow;
    d += `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}

export interface BannerDevice {
  field: string;
  band: string;
  /** 0 plain, 1 per pale, 2 per fess, 3 chevron. */
  division: 0 | 1 | 2 | 3;
  letter: string;
}

const FIELDS = ['#5c2a22', '#27412f', '#2c3f5a', '#4a3a1c', '#43304f', '#3c3c38', '#6a4a1e', '#1f4a4a'];
const BANDS = ['#c9a85a', '#d8cba6', '#b08a4a', '#e4dcc4'];

/**
 * A placeholder banner for a faction. The documents describe no heraldry, so this is
 * deliberately abstract (colours + initial) and is derived only from the stable entity id.
 */
export function bannerDevice(factionId: string, name: string): BannerDevice {
  const rand = rng(factionId);
  const initial = name.replace(/^(the|baron|royal house of)\s+/i, '').trim()[0] ?? '?';
  return {
    field: FIELDS[Math.floor(rand() * FIELDS.length)],
    band: BANDS[Math.floor(rand() * BANDS.length)],
    division: Math.floor(rand() * 4) as BannerDevice['division'],
    letter: initial.toUpperCase(),
  };
}

/** Initials for a hero token when no approved portrait exists. */
export function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}
