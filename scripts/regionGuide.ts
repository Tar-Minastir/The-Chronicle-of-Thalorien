/**
 * Region reference package: pure builders for the manifest, the terrain-class raster and the two
 * guide drawings (SVG). No file or network access here; `scripts/art-guides.ts` does the I/O.
 *
 * Everything is derived from the atlas's existing data (gazetteer, geography.ts, terrain.ts,
 * fields.ts, regions.ts). Nothing geographical is authored in this file.
 */
import { crc32, deflateSync } from 'node:zlib';
import { buildFields, sample, toneAt } from '../src/atlas/fields';
import type { AtlasFeature, XY } from '../src/atlas/geography';
import { routePath } from '../src/atlas/glyphs';
import { riverCourse } from '../src/atlas/paint';
import { regionPixelSize, worldToRegionPixel, type ArtRegion } from '../src/atlas/regions';
import { ROUTES } from '../src/atlas/terrain';
import { GAZETTEER } from '../src/campaign/gazetteer';

// ------------------------------------------------------------------ inputs

export interface GuidePlace {
  slug: string;
  name: string;
  kind: string;
  tier: 0 | 1 | 2;
  parent?: string;
  world: XY;
  /** True when the player dragged this marker; `world` is then their position, not the gazetteer's. */
  userAdjusted: boolean;
  /** Where each mention of the name sits in the authorized documents (first few), when known. */
  sources?: { file: string; line: number; endLine: number }[];
  mentionCount?: number;
}

/** Places straight from the gazetteer, with the player's marker moves applied. */
export function gazetteerPlaces(overrides: Record<string, { x: number; y: number }> = {}): GuidePlace[] {
  return GAZETTEER.map((g) => {
    const o = overrides[`location:${g.id}`];
    return {
      slug: g.id, name: g.name, kind: g.kind, tier: g.tier, parent: g.parent,
      world: o ? [o.x, o.y] : [g.at[0], g.at[1]], userAdjusted: Boolean(o),
    };
  });
}

// ------------------------------------------------------------------ terrain classes

export const TERRAIN_CLASSES = [
  { key: 'lowland', label: 'Open lowland', geo: '#f3efe2', art: '#a9b77a', paint: 'Open grassland, meadow and farmed valley floor.' },
  { key: 'groves', label: 'Scattered groves (texture only, not data)', geo: '#f3efe2', art: '#8fa765', paint: 'Loose copses and hedgerow trees thinning into open country. Placement is free.' },
  { key: 'forest-green', label: 'Forest: green broadleaf', geo: '#4caf50', art: '#3f6b3a', paint: 'Dense continuous canopy, deep green.' },
  { key: 'forest-silver', label: 'Forest: the Silverwood', geo: '#8fd3c4', art: '#7fa39a', paint: 'Dense continuous canopy with pale, silver-grey foliage.' },
  { key: 'forest-scarred', label: 'Forest: Uchkeken, fire-scarred', geo: '#c0692b', art: '#6b5a43', paint: 'Burnt and recovering wood: dead grey timber, charred stumps, ash-dark ground, new green returning. Not lush.' },
  { key: 'heath', label: 'Heath and moor', geo: '#e0cc66', art: '#b59f6a', paint: 'Open upland heath: heather, peat, rough grass, few trees.' },
  { key: 'hills', label: 'Hills and foothills', geo: '#d9b88c', art: '#9c9a6c', paint: 'Rolling hills and the lower slopes of the ranges.' },
  { key: 'mountain', label: 'Mountains', geo: '#9a9a9a', art: '#8a8378', paint: 'Connected rocky mountains with strong relief.' },
  { key: 'peak', label: 'High crests', geo: '#5e5e5e', art: '#bcb7b0', paint: 'The highest crests of a range: bare rock, snow only where the manifest marks the range snowy.' },
  { key: 'sea', label: 'Sea', geo: '#5b9bd5', art: '#3e6f8e', paint: 'Open sea.' },
  { key: 'fen', label: 'Fen', geo: '#7fb8a4', art: '#6f8f73', paint: 'Reed fen and standing water.' },
  { key: 'waste', label: 'Waste', geo: '#cfcfcf', art: '#a39d93', paint: 'Ashen waste.' },
  { key: 'ice', label: 'Ice', geo: '#e6f4ff', art: '#e3eef2', paint: 'Glacier.' },
] as const;
const CLASS = Object.fromEntries(TERRAIN_CLASSES.map((c, i) => [c.key, i])) as Record<(typeof TERRAIN_CLASSES)[number]['key'], number>;

export interface TerrainRaster {
  width: number;
  height: number;
  classes: Uint8Array;
  /** Share of the region's area per class key, 0..1. */
  coverage: Record<string, number>;
}

/**
 * Classify every guide pixel from the same scalar fields the app paints its terrain from, so the
 * guide's forest edges, ranges and heaths are where the running atlas shows them.
 */
export function classifyTerrain(region: ArtRegion, features: AtlasFeature[]): TerrainRaster {
  const { width, height } = regionPixelSize(region);
  const all = buildFields(features);
  // Elevation from mountains alone, so that hills are never drawn as mountains.
  const mtn = buildFields(features.filter((f) => f.type !== 'hills'));
  const classes = new Uint8Array(width * height);
  const counts = new Array<number>(TERRAIN_CLASSES.length).fill(0);
  for (let py = 0; py < height; py++) {
    const y = region.bounds.y0 + (py + 0.5) / region.pxPerUnit;
    for (let px = 0; px < width; px++) {
      const x = region.bounds.x0 + (px + 0.5) / region.pxPerUnit;
      let c = CLASS.lowland;
      if (sample(all.sea, x, y) > 0) c = CLASS.sea;
      else if (sample(all.ice, x, y) > 0.5) c = CLASS.ice;
      else if (sample(all.waste, x, y) > 0.5) c = CLASS.waste;
      else if (sample(all.fen, x, y) > 0.5) c = CLASS.fen;
      else {
        const em = sample(mtn.elev, x, y);
        const forest = sample(all.forest, x, y);
        // Tone is stored per grid node; take the strongest of the four nodes round the pixel so that
        // a wood's edge follows the smooth density field instead of the 2-unit grid.
        const tone = Math.max(toneAt(all, x - 1, y - 1), toneAt(all, x + 1, y - 1), toneAt(all, x - 1, y + 1), toneAt(all, x + 1, y + 1));
        if (em >= 0.6) c = CLASS.peak;
        else if (em >= 0.38) c = CLASS.mountain;
        else if (forest >= 0.5 && tone > 0) c = tone === 3 ? CLASS['forest-scarred'] : tone === 2 ? CLASS['forest-silver'] : CLASS['forest-green'];
        else if (sample(all.heath, x, y) > 0.5) c = CLASS.heath;
        else if (sample(all.elev, x, y) >= 0.25) c = CLASS.hills;
        else if (forest >= 0.4) c = CLASS.groves;
      }
      classes[py * width + px] = c;
      counts[c]++;
    }
  }
  const coverage: Record<string, number> = {};
  TERRAIN_CLASSES.forEach((c, i) => {
    if (counts[i]) coverage[c.key] = Math.round((counts[i] / classes.length) * 10000) / 10000;
  });
  return { width, height, classes, coverage };
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Encode the class raster as an 8-bit RGB PNG using one of the two palettes. */
export function terrainPng(r: TerrainRaster, palette: 'geo' | 'art'): Buffer {
  const colours = TERRAIN_CLASSES.map((c) => rgb(c[palette]));
  const stride = r.width * 3 + 1;
  const raw = Buffer.alloc(stride * r.height);
  for (let y = 0; y < r.height; y++) {
    let o = y * stride + 1;
    for (let x = 0; x < r.width; x++) {
      const c = colours[r.classes[y * r.width + x]];
      raw[o++] = c[0];
      raw[o++] = c[1];
      raw[o++] = c[2];
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(r.width, 0);
  head.writeUInt32BE(r.height, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Width and height from a PNG file's header. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

// ------------------------------------------------------------------ manifest

const shapePoints = (f: AtlasFeature): XY[] => (f.shape.kind === 'point' ? [f.shape.at] : f.shape.points);

function boxOf(pts: XY[], pad = 0) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}
const touches = (r: ArtRegion, b: ReturnType<typeof boxOf>) =>
  b.x1 >= r.bounds.x0 && b.x0 <= r.bounds.x1 && b.y1 >= r.bounds.y0 && b.y0 <= r.bounds.y1;
const within = (r: ArtRegion, b: ReturnType<typeof boxOf>) =>
  b.x0 >= r.bounds.x0 && b.x1 <= r.bounds.x1 && b.y0 >= r.bounds.y0 && b.y1 <= r.bounds.y1;

/** Features that reach into the region (ranges and rivers padded by their drawn half-width). */
export function featuresInRegion(region: ArtRegion, features: AtlasFeature[]): AtlasFeature[] {
  return features.filter((f) => touches(region, boxOf(shapePoints(f), f.shape.kind === 'line' ? (f.width ?? 0) : 0)));
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const slugTitle = (id: string) => id.replace(/^atlas:/, '').replace(/-/g, ' ');

/** Legend box of the geography guide, in world units (top-left corner, clear of every vector feature). */
export const legendBox = (r: ArtRegion) => ({ x0: r.bounds.x0 + 5, y0: r.bounds.y0 + 5, x1: r.bounds.x0 + 119, y1: r.bounds.y0 + 113 });

export function buildManifest(region: ArtRegion, places: GuidePlace[], features: AtlasFeature[], raster?: TerrainRaster, provenance?: unknown) {
  const { x0, y0, x1, y1 } = region.bounds;
  const px = regionPixelSize(region);
  const k = region.pxPerUnit;
  const toPx = (p: XY): XY => worldToRegionPixel(region, p[0], p[1]);
  const inside = featuresInRegion(region, features);
  const common = (f: AtlasFeature) => ({
    id: f.id,
    name: f.name ?? null,
    canon: f.status === 'proposed' ? 'proposed-atlas-addition' : 'atlas-interpretation',
    description: f.description,
    ...(f.status === 'interpreted' ? { basisQuotes: f.basis ?? [], basisNote: f.basis?.length ? undefined : 'Rests on the place name alone.' } : {}),
    nearPlaces: f.near ?? [],
    ...(f.relation ? { relation: f.relation } : {}),
    extendsBeyondBounds: !within(region, boxOf(shapePoints(f))),
  });
  const line = (f: AtlasFeature) => {
    const pts = shapePoints(f);
    return { points: pts, pixels: pts.map(toPx) };
  };

  const anchors = places
    .filter((p) => p.world[0] >= x0 && p.world[0] <= x1 && p.world[1] >= y0 && p.world[1] <= y1)
    .map((p) => {
      const g = GAZETTEER.find((e) => e.id === p.slug);
      return {
        id: `location:${p.slug}`,
        name: p.name,
        kind: p.kind,
        tier: p.tier,
        primary: p.tier === 0,
        ...(p.parent ? { parent: `location:${p.parent}` } : {}),
        world: p.world,
        pixel: toPx(p.world),
        canon: 'confirmed-canon',
        position: {
          canon: 'atlas-interpretation',
          basis: p.userAdjusted ? 'user-adjusted' : g?.relations?.length ? 'provisional, consistent with stated relations' : 'provisional, no stated position',
          userAdjusted: p.userAdjusted,
        },
        statedRelations: (g?.relations ?? []).map((r) => ({ kind: r.kind, target: `location:${r.target}`, bearing: r.bearing ?? null, quote: r.quote, certainty: r.certainty })),
        ...(p.sources ? { sources: p.sources, mentionCount: p.mentionCount ?? p.sources.length } : {}),
      };
    });

  const byId = new Map(places.map((p) => [p.slug, p]));
  return {
    schema: 'thalorien.region-manifest/1',
    id: region.id,
    title: region.title,
    generator: 'npm run art:guides (scripts/art-guides.ts)',
    ...(provenance ? { provenance } : {}),
    coordinateSystem: {
      name: 'Thalorien atlas world space',
      extent: [0, 0, 1000, 1000],
      axes: 'x increases east, y increases south; north is up',
      scale: 'none: the campaign documents state no distances precise enough to fix one',
      note: 'One coordinate system is used by the gazetteer, the atlas geometry, both guide images and the finished artwork.',
    },
    bounds: { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0, centre: [(x0 + x1) / 2, (y0 + y1) / 2] },
    aspectRatio: `${(x1 - x0) / gcd(x1 - x0, y1 - y0)}:${(y1 - y0) / gcd(x1 - x0, y1 - y0)}`,
    image: { width: px.width, height: px.height, pxPerWorldUnit: k },
    transform: {
      worldToPixel: { px: `(x - ${x0}) * ${k}`, py: `(y - ${y0}) * ${k}`, matrix: [k, 0, 0, k, -x0 * k, -y0 * k] },
      pixelToWorld: { x: `px / ${k} + ${x0}`, y: `py / ${k} + ${y0}`, matrix: [1 / k, 0, 0, 1 / k, x0, y0] },
      note: 'Affine, axis-aligned, no rotation. Pixel (0, 0) is the top-left corner of the top-left pixel. Valid for any uniformly resized copy after dividing by the resize factor.',
    },
    files: {
      geographyGuide: 'geography-guide.png',
      artworkGuide: 'artwork-guide.png',
      manifest: 'region-manifest.json',
      finishedArtworkSlot: `public/atlas-art/regions/${region.id}.webp (or .png / .jpg)`,
    },
    canonCategories: {
      'confirmed-canon': 'Stated in the four authorized campaign documents: that the place exists, its name, and the quoted relations between places.',
      'atlas-interpretation': 'The atlas giving a confirmed fact a drawable form: every coordinate, outline, extent, river course and ridgeline. Not canon.',
      'proposed-atlas-addition': 'Invented by the atlas for a coherent world; awaiting the Dungeon Master. Not canon, removable by the player.',
    },
    userAdjustedPositions: places.filter((p) => p.userAdjusted).map((p) => `location:${p.slug}`),
    anchors,
    terrainRegions: inside.filter((f) => f.shape.kind === 'area' && f.type !== 'lake').map((f) => ({
      ...common(f), type: f.type, ...(f.tone ? { tone: f.tone } : {}), polygon: shapePoints(f), polygonPixels: shapePoints(f).map(toPx),
      edgeNote: 'Authored outline. The atlas draws the edge irregularly, within about 22 world units of this polygon.',
    })),
    ridgelines: inside.filter((f) => f.type === 'mountains' || f.type === 'hills').map((f) => ({
      ...common(f), type: f.type, relief: f.height ?? null, halfWidth: f.width ?? null, snowy: Boolean(f.snowy), ...line(f),
    })),
    rivers: inside.filter((f) => f.type === 'river').map((f) => ({
      ...common(f), halfWidth: f.width ?? null, ...line(f),
      course: riverCourse(shapePoints(f), f.id).map((p) => [round3(p[0]), round3(p[1])]),
      courseNote: 'The smoothed, meandering course the atlas and both guides draw (world units, 3 decimals).',
    })),
    lakes: inside.filter((f) => f.type === 'lake').map((f) => ({ ...common(f), polygon: shapePoints(f).map((p) => [round3(p[0]), round3(p[1])]) })),
    roads: inside.filter((f) => f.type === 'road').map((f) => ({ ...common(f), ...line(f) })),
    pointFeatures: inside.filter((f) => f.shape.kind === 'point').map((f) => ({ ...common(f), type: f.type, world: shapePoints(f)[0], pixel: toPx(shapePoints(f)[0]) })),
    recordedRoutes: ROUTES.filter((r) => r.stops.some((s) => {
      const p = byId.get(s);
      return p && p.world[0] >= x0 && p.world[0] <= x1 && p.world[1] >= y0 && p.world[1] <= y1;
    })).map((r) => ({
      id: r.id, label: r.label, kind: r.kind, canon: 'confirmed-canon', quote: r.quote,
      stops: r.stops.map((s) => ({ id: `location:${s}`, world: byId.get(s)?.world ?? null, insideBounds: Boolean(byId.get(s) && anchors.some((a) => a.id === `location:${s}`)) })),
      geometry: 'schematic: a line between the stops. The documents give no road geometry. Drawn live by the website, never part of the artwork.',
    })),
    proposedAdditions: inside.filter((f) => f.status === 'proposed').map((f) => f.id),
    terrainClasses: TERRAIN_CLASSES.filter((c) => !raster || raster.coverage[c.key]).map((c) => ({
      key: c.key, label: c.label, geographyGuideColour: c.geo, artworkGuideColour: c.art, paintAs: c.paint,
      ...(raster ? { shareOfRegion: raster.coverage[c.key] } : {}),
    })),
    geographyGuideLegendBox: { ...legendBox(region), note: 'World rectangle covered by the legend in geography-guide.png. It hides only open lowland.' },
    integration: {
      slot: `/atlas-art/regions/${region.id}.{webp,png,jpg}`,
      registry: 'src/atlas/regions.ts',
      featherWorldUnits: region.feather,
      neighbourOverlapWorldUnits: region.feather * 2,
    },
  };
}

// ------------------------------------------------------------------ drawings

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
const MAGENTA = '#b0006d';

interface Box { x0: number; y0: number; x1: number; y1: number }
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Greedy label placement: try positions round the point, keep the first that hits nothing. */
class Labels {
  private boxes: Box[] = [];
  readonly out: string[] = [];
  constructor(private w: number, private h: number) {}
  block(b: Box) {
    this.boxes.push(b);
  }
  add(text: string, at: XY, size: number, style: string, centred: boolean, gap = 14) {
    const tw = text.length * size * 0.56 + 8;
    const th = size * 1.2;
    const cands: { box: Box; leader: boolean }[] = [];
    const push = (cx: number, cy: number, leader: boolean) =>
      cands.push({ box: { x0: cx - tw / 2, y0: cy - th / 2, x1: cx + tw / 2, y1: cy + th / 2 }, leader });
    if (centred) for (const d of [0, -1, 1, -2, 2, -3, 3]) push(at[0], at[1] + d * th, false);
    for (const m of [1, 2.6, 4.4]) {
      const g = gap * m;
      const dx = tw / 2 + g;
      const dy = th / 2 + g;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]]) {
        push(at[0] + sx * (sx && sy ? dx * 0.8 : dx), at[1] + sy * (sx && sy ? dy * 0.9 : dy), m > 1);
      }
    }
    let best = cands[0];
    let bestCost = Infinity;
    for (const c of cands) {
      const off = c.box.x0 < 4 || c.box.y0 < 4 || c.box.x1 > this.w - 4 || c.box.y1 > this.h - 4;
      const cost = (off ? 1e9 : 0) + this.boxes.reduce((s, b) => s + overlap(c.box, b), 0);
      if (cost < bestCost) {
        best = c;
        bestCost = cost;
        if (!cost) break;
      }
    }
    this.boxes.push(best.box);
    const cx = (best.box.x0 + best.box.x1) / 2;
    const cy = (best.box.y0 + best.box.y1) / 2;
    if (best.leader) this.out.push(`<line x1="${at[0]}" y1="${at[1]}" x2="${cx}" y2="${cy}" stroke="#333" stroke-width="1.5"/>`);
    this.out.push(
      `<text x="${cx.toFixed(1)}" y="${(cy + size * 0.35).toFixed(1)}" font-size="${size}" text-anchor="middle" ${style} stroke="#fff" stroke-width="${Math.max(5, size * 0.22)}" stroke-linejoin="round" paint-order="stroke">${esc(text)}</text>`,
    );
  }
}

const pathOf = (pts: XY[], close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('') + (close ? 'Z' : '');
const mid = (pts: XY[]): XY => pts[Math.floor(pts.length / 2)];

function prepare(region: ArtRegion, places: GuidePlace[], features: AtlasFeature[]) {
  const toPx = (p: XY): XY => worldToRegionPixel(region, p[0], p[1]);
  const inside = featuresInRegion(region, features);
  const { x0, y0, x1, y1 } = region.bounds;
  const here = places.filter((p) => p.world[0] >= x0 && p.world[0] <= x1 && p.world[1] >= y0 && p.world[1] <= y1);
  return { toPx, inside, here, size: regionPixelSize(region), k: region.pxPerUnit };
}

/** Guide A: labelled technical geography over the terrain classes. `terrainHref` is the geo-palette PNG. */
export function geographyGuideSvg(region: ArtRegion, places: GuidePlace[], features: AtlasFeature[], raster: TerrainRaster, terrainHref: string): string {
  const { toPx, inside, here, size, k } = prepare(region, places, features);
  const { x0, y0, x1, y1 } = region.bounds;
  const W = size.width;
  const H = size.height;
  const o: string[] = [];
  const labels = new Labels(W, H);
  const lb = legendBox(region);
  const [lx0, ly0] = toPx([lb.x0, lb.y0]);
  const [lx1, ly1] = toPx([lb.x1, lb.y1]);
  labels.block({ x0: lx0, y0: ly0, x1: lx1, y1: ly1 });

  o.push(`<image href="${terrainHref}" x="0" y="0" width="${W}" height="${H}"/>`);

  // Grid: every 50 world units, labelled every 100 along the bottom and right edges.
  for (let x = Math.ceil(x0 / 50) * 50; x <= x1; x += 50) {
    const px = toPx([x, 0])[0];
    const major = x % 100 === 0;
    o.push(`<line x1="${px}" y1="0" x2="${px}" y2="${H}" stroke="#000" stroke-opacity="${major ? 0.32 : 0.14}" stroke-width="${major ? 2 : 1}"/>`);
    if (major) {
      o.push(`<text x="${px + 6}" y="${H - 12}" font-size="24" font-family="Consolas, monospace" fill="#000" stroke="#fff" stroke-width="5" paint-order="stroke">x ${x}</text>`);
      labels.block({ x0: px, y0: H - 40, x1: px + 90, y1: H });
    }
  }
  for (let y = Math.ceil(y0 / 50) * 50; y <= y1; y += 50) {
    const py = toPx([0, y])[1];
    const major = y % 100 === 0;
    o.push(`<line x1="0" y1="${py}" x2="${W}" y2="${py}" stroke="#000" stroke-opacity="${major ? 0.32 : 0.14}" stroke-width="${major ? 2 : 1}"/>`);
    if (major) {
      o.push(`<text x="${W - 10}" y="${py - 8}" font-size="24" font-family="Consolas, monospace" text-anchor="end" fill="#000" stroke="#fff" stroke-width="5" paint-order="stroke">y ${y}</text>`);
      labels.block({ x0: W - 100, y0: py - 36, x1: W, y1: py });
    }
  }

  // Authored outlines of terrain regions (the data), over the irregular edge the atlas actually draws.
  for (const f of inside.filter((x) => x.shape.kind === 'area' && x.type !== 'lake')) {
    o.push(`<path d="${pathOf(shapePoints(f).map(toPx), true)}" fill="none" stroke="${f.status === 'proposed' ? MAGENTA : '#222'}" stroke-width="3" stroke-dasharray="14 9"/>`);
  }
  // Ridgelines.
  for (const f of inside.filter((x) => x.type === 'mountains' || x.type === 'hills')) {
    const pts = shapePoints(f).map(toPx);
    const colour = f.status === 'proposed' ? MAGENTA : '#4e342e';
    o.push(`<path d="${pathOf(pts)}" fill="none" stroke="${colour}" stroke-width="${f.type === 'mountains' ? 7 : 5}" stroke-linejoin="round" ${f.type === 'hills' ? 'stroke-dasharray="20 8"' : ''}/>`);
    for (const p of pts) o.push(`<path d="M${p[0]} ${p[1] - 13}L${p[0] + 11} ${p[1] + 8}L${p[0] - 11} ${p[1] + 8}Z" fill="${colour}" stroke="#fff" stroke-width="2"/>`);
  }
  // Waters.
  for (const f of inside.filter((x) => x.type === 'lake')) {
    o.push(`<path d="${pathOf(shapePoints(f).map(toPx), true)}" fill="#1e73d2" stroke="#fff" stroke-width="2"/>`);
  }
  for (const f of inside.filter((x) => x.type === 'river')) {
    const d = pathOf(riverCourse(shapePoints(f), f.id).map(toPx));
    const w = Math.max(9, (f.width ?? 2) * k * 0.9);
    o.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/>`);
    o.push(`<path d="${d}" fill="none" stroke="${f.status === 'proposed' ? '#7a4fd6' : '#1e73d2'}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  // Roads and recorded routes.
  for (const f of inside.filter((x) => x.type === 'road')) {
    const pts = shapePoints(f).map(toPx).map(([x, y]) => ({ x, y }));
    o.push(`<path d="${routePath(f.id, pts)}" fill="none" stroke="${MAGENTA}" stroke-width="6" stroke-dasharray="22 12"/>`);
  }
  const byId = new Map(places.map((p) => [p.slug, p]));
  const dash = { road: '', travelled: 'stroke-dasharray="26 12"', planned: 'stroke-dasharray="6 12"' } as const;
  for (const r of ROUTES) {
    const stops = r.stops.map((s) => byId.get(s)).filter((p): p is GuidePlace => Boolean(p));
    if (stops.length < 2 || !stops.some((p) => here.includes(p))) continue;
    const pts = stops.map((p) => toPx(p.world));
    o.push(`<path d="${routePath(r.id, pts.map(([x, y]) => ({ x, y })))}" fill="none" stroke="#c62828" stroke-width="6" stroke-linecap="round" ${dash[r.kind]}/>`);
  }

  // Markers first (so labels avoid them), then labels in priority order.
  const marks: string[] = [];
  const queue: (() => void)[] = [];
  for (const p of [...here].sort((a, b) => a.tier - b.tier)) {
    const [px, py] = toPx(p.world);
    const s = p.tier === 0 ? 13 : p.tier === 1 ? 10 : 8;
    const size = p.tier === 0 ? 34 : p.tier === 1 ? 26 : 22;
    if (p.kind === 'settlement') marks.push(`<rect x="${px - s}" y="${py - s}" width="${s * 2}" height="${s * 2}" fill="#111" stroke="#fff" stroke-width="3"/>`);
    else if (p.kind === 'site') marks.push(`<circle cx="${px}" cy="${py}" r="${s}" fill="#111" stroke="#fff" stroke-width="3"/>`);
    else marks.push(`<path d="M${px - s} ${py}H${px + s}M${px} ${py - s}V${py + s}" stroke="#fff" stroke-width="7"/><path d="M${px - s} ${py}H${px + s}M${px} ${py - s}V${py + s}" stroke="#111" stroke-width="3"/>`);
    labels.block({ x0: px - s - 2, y0: py - s - 2, x1: px + s + 2, y1: py + s + 2 });
    const areaLike = p.kind !== 'settlement' && p.kind !== 'site';
    queue.push(() => labels.add(p.name + (p.userAdjusted ? ' *' : ''), [px, py], size, `font-family="${FONT}" font-weight="700" ${areaLike ? 'font-style="italic"' : ''} fill="#111"`, false, s + 6));
  }
  for (const f of inside.filter((x) => x.shape.kind === 'point')) {
    const [px, py] = toPx(shapePoints(f)[0]);
    marks.push(`<path d="M${px} ${py - 13}L${px + 13} ${py}L${px} ${py + 13}L${px - 13} ${py}Z" fill="#fff" stroke="${MAGENTA}" stroke-width="4"/>`);
    labels.block({ x0: px - 15, y0: py - 15, x1: px + 15, y1: py + 15 });
    queue.push(() => labels.add(`${f.name ?? slugTitle(f.id)} (proposed ${f.type})`, [px, py], 22, `font-family="${FONT}" font-style="italic" font-weight="600" fill="${MAGENTA}"`, false, 18));
  }
  for (const f of inside.filter((x) => x.shape.kind !== 'point')) {
    const named = f.status === 'proposed';
    // An interpreted shape is already named by the gazetteer place it draws, unless it has none of its own.
    if (!named && (f.near ?? []).some((n) => f.id === `atlas:${n}` || here.some((p) => p.slug === n && (f.type === 'forest' || f.type === 'heath' || f.type === 'river')))) continue;
    const at = toPx(f.label?.at ?? (f.shape.kind === 'line' ? mid(shapePoints(f)) : [boxOf(shapePoints(f)).x0 / 2 + boxOf(shapePoints(f)).x1 / 2, boxOf(shapePoints(f)).y0 / 2 + boxOf(shapePoints(f)).y1 / 2]));
    if (at[0] < 0 || at[1] < 0 || at[0] > W || at[1] > H) continue;
    const text = named ? `${f.name} (proposed)` : `${slugTitle(f.id)} (interpreted ${f.type})`;
    queue.push(() => labels.add(text, at, 22, `font-family="${FONT}" font-style="italic" font-weight="600" fill="${named ? MAGENTA : '#4e342e'}"`, true));
  }
  for (const r of ROUTES) {
    const stops = r.stops.map((s) => byId.get(s)).filter((p): p is GuidePlace => Boolean(p));
    if (stops.length < 2 || !stops.every((p) => here.includes(p))) continue;
    const a = toPx(stops[0].world);
    const b = toPx(stops[1].world);
    queue.push(() => labels.add(`${r.label} (${r.kind} route)`, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 22, `font-family="${FONT}" font-style="italic" font-weight="600" fill="#c62828"`, true));
  }
  o.push(...marks);
  queue.forEach((q) => q());
  o.push(...labels.out);

  // Legend.
  const L: string[] = [];
  let ty = ly0 + 36;
  const text = (s: string, bold = false, sz = 19) => {
    L.push(`<text x="${lx0 + 16}" y="${ty}" font-size="${sz}" font-family="${FONT}" ${bold ? 'font-weight="700"' : ''} fill="#111">${esc(s)}</text>`);
    ty += sz * 1.32;
  };
  const row = (swatch: string, s: string) => {
    L.push(swatch.replace(/\$y/g, String(ty - 7)));
    L.push(`<text x="${lx0 + 78}" y="${ty}" font-size="18" font-family="${FONT}" fill="#111">${esc(s)}</text>`);
    ty += 24;
  };
  const sx = lx0 + 16;
  text(`${region.title} — geography guide`, true, 22);
  text(`World x ${x0}–${x1}, y ${y0}–${y1} · ${k} px per world unit`, false, 16);
  text('North up · no distance scale · grid every 50 units', false, 16);
  ty += 4;
  for (const c of TERRAIN_CLASSES) {
    if (!raster.coverage[c.key] || c.key === 'groves') continue;
    row(`<rect x="${sx}" y="${ty - 15}" width="50" height="17" fill="${c.geo}" stroke="#444"/>`, c.label);
  }
  row(`<line x1="${sx}" y1="$y" x2="${sx + 50}" y2="$y" stroke="#222" stroke-width="3" stroke-dasharray="14 9"/>`, 'Authored outline of a terrain region');
  row(`<line x1="${sx}" y1="$y" x2="${sx + 50}" y2="$y" stroke="#4e342e" stroke-width="7"/>`, 'Mountain ridgeline (dashed: hills)');
  row(`<line x1="${sx}" y1="$y" x2="${sx + 50}" y2="$y" stroke="#1e73d2" stroke-width="9"/>`, 'River, lake (violet: proposed river)');
  row(`<line x1="${sx}" y1="$y" x2="${sx + 50}" y2="$y" stroke="#c62828" stroke-width="6"/>`, 'Recorded road; dashed travelled, dotted planned');
  row(`<rect x="${sx + 4}" y="${ty - 17}" width="18" height="18" fill="#111"/><circle cx="${sx + 38}" cy="$y" r="9" fill="#111"/>`, 'Settlement · site (confirmed place)');
  row(`<path d="M${sx + 16} $yh18M${sx + 25} ${ty - 16}v18" stroke="#111" stroke-width="3"/>`, 'Anchor of a named region, water or road');
  row(`<path d="M${sx + 25} ${ty - 19}l12 12l-12 12l-12 -12Z" fill="#fff" stroke="${MAGENTA}" stroke-width="4"/>`, 'Magenta: proposed atlas addition (not canon)');
  text('Every position is provisional (atlas interpretation).', false, 16);
  text('* = marker moved by the player.', false, 16);
  o.push(`<rect x="${lx0}" y="${ly0}" width="${lx1 - lx0}" height="${ly1 - ly0}" fill="#fff" fill-opacity="0.94" stroke="#111" stroke-width="3"/>`, ...L);
  o.push(`<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" fill="none" stroke="#111" stroke-width="3"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o.join('')}</svg>`;
}

/**
 * Guide B: the same geography with no lettering, grid or legend, in landscape colours, for use as a
 * composition reference by an image generator. Routes and roads are left out on purpose: they are
 * schematic lines drawn live by the website.
 */
export function artworkGuideSvg(region: ArtRegion, places: GuidePlace[], features: AtlasFeature[], terrainHref: string): string {
  const { toPx, inside, here, size, k } = prepare(region, places, features);
  const W = size.width;
  const H = size.height;
  const o: string[] = [`<image href="${terrainHref}" x="0" y="0" width="${W}" height="${H}"/>`];
  for (const f of inside.filter((x) => x.type === 'mountains' || x.type === 'hills')) {
    o.push(`<path d="${pathOf(shapePoints(f).map(toPx))}" fill="none" stroke="#3b3128" stroke-opacity="${f.type === 'mountains' ? 0.6 : 0.35}" stroke-width="${f.type === 'mountains' ? 9 : 6}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const f of inside.filter((x) => x.type === 'lake')) o.push(`<path d="${pathOf(shapePoints(f).map(toPx), true)}" fill="#2f5f86"/>`);
  for (const f of inside.filter((x) => x.type === 'river')) {
    o.push(`<path d="${pathOf(riverCourse(shapePoints(f), f.id).map(toPx))}" fill="none" stroke="#2f5f86" stroke-width="${Math.max(9, (f.width ?? 2) * k * 0.9)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  const dot = (p: XY, r: number, fill: string, ring: string) => o.push(`<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${fill}" stroke="${ring}" stroke-width="${Math.max(3, r * 0.3)}"/>`);
  for (const f of inside.filter((x) => x.shape.kind === 'point')) dot(toPx(shapePoints(f)[0]), 8, '#2b1d12', '#f5e9c8');
  for (const p of here) {
    if (p.kind !== 'settlement' && p.kind !== 'site') continue;
    const r = p.tier === 0 ? 17 : p.tier === 1 ? 12 : 9;
    if (p.slug === 'heart-of-uchkeken') dot(toPx(p.world), 17, '#ffffff', '#2b1d12');
    else dot(toPx(p.world), r, '#2b1d12', '#f5e9c8');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o.join('')}</svg>`;
}
