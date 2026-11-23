/**
 * Illustrated regions: rectangles of the world that can be covered by a painted terrain image.
 *
 * This is the single source of truth for a region's bounds. The guide generator
 * (`npm run art:guides`) reads it to produce the reference package in `artwork-guides/<id>/`, and
 * `BaseMap` reads it to place the finished painting. Nothing else needs to change when artwork
 * arrives: drop `public/atlas-art/regions/<id>.webp` (or .png / .jpg) and it is drawn.
 *
 * Rules:
 *  - Bounds are in world units (0..1000, x east, y south, north up), the same space as the gazetteer.
 *  - Every region uses the same `pxPerUnit`, so adjacent paintings share one illustration scale.
 *  - A painting covers exactly its bounds, with no perspective shift of positions: world point (x, y)
 *    is at image fraction ((x - x0) / width, (y - y0) / height).
 *  - Neighbouring regions must overlap by at least 2 × `feather` world units. Each image fades out
 *    over `feather` units at its edges, so in an overlap one painting is always fully opaque while
 *    the other fades: the seam is a cross-fade, and the procedural terrain never shows through.
 *  - Later entries are drawn over earlier ones.
 */
export interface ArtRegion {
  /** Stable id: folder name under artwork-guides/ and file name under public/atlas-art/regions/. */
  id: string;
  title: string;
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** Guide and master-artwork resolution: image pixels per world unit. */
  pxPerUnit: number;
  /** Edge fade in world units when the painting is composited over the terrain around it. */
  feather: number;
}

export const REGION_PX_PER_UNIT = 5;

export const ART_REGIONS: readonly ArtRegion[] = [
  {
    id: 'uchkeken-region',
    title: 'Uchkeken and the Heartlands',
    // 840 × 560 world units, 3:2. Centre (500, 570); Uchkeken's heart is at (520, 640).
    bounds: { x0: 80, y0: 290, x1: 920, y1: 850 },
    pxPerUnit: REGION_PX_PER_UNIT,
    feather: 20,
  },
];

/** Formats probed for a region painting, in order. */
export const REGION_ART_EXTENSIONS = ['webp', 'png', 'jpg'] as const;
/** Served from the site's base ("/" locally, a subfolder on GitHub Pages). */
export const regionArtUrl = (id: string, ext: string) => `${import.meta.env?.BASE_URL ?? '/'}atlas-art/regions/${id}.${ext}`;

export const regionSize = (r: ArtRegion) => ({ width: r.bounds.x1 - r.bounds.x0, height: r.bounds.y1 - r.bounds.y0 });
export const regionPixelSize = (r: ArtRegion) => {
  const s = regionSize(r);
  return { width: s.width * r.pxPerUnit, height: s.height * r.pxPerUnit };
};
/** World point -> pixel in the region's guide / master artwork. Exact: no rounding, no offset. */
export const worldToRegionPixel = (r: ArtRegion, x: number, y: number): [number, number] => [
  (x - r.bounds.x0) * r.pxPerUnit,
  (y - r.bounds.y0) * r.pxPerUnit,
];
export const regionPixelToWorld = (r: ArtRegion, px: number, py: number): [number, number] => [
  px / r.pxPerUnit + r.bounds.x0,
  py / r.pxPerUnit + r.bounds.y0,
];
export const inRegion = (r: ArtRegion, x: number, y: number) =>
  x >= r.bounds.x0 && x <= r.bounds.x1 && y >= r.bounds.y0 && y <= r.bounds.y1;
