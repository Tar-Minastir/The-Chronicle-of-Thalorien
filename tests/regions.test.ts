/**
 * Milestone 2D: illustrated regions and their reference package. The committed manifest and guide
 * images must agree with the live geography data, so stale guides are caught when the data changes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATLAS_FEATURES, emptyAtlasEdits, resolveFeatures } from '../src/atlas/geography';
import { ART_REGIONS, inRegion, regionPixelSize, regionPixelToWorld, regionSize, worldToRegionPixel } from '../src/atlas/regions';
import { GAZETTEER } from '../src/campaign/gazetteer';
import { buildManifest, featuresInRegion, gazetteerPlaces, pngSize } from '../scripts/regionGuide';

const features = resolveFeatures(emptyAtlasEdits(), true);

describe('region registry', () => {
  it('keeps every region inside the world, at one shared illustration scale', () => {
    for (const r of ART_REGIONS) {
      expect(r.bounds.x0).toBeGreaterThanOrEqual(0);
      expect(r.bounds.y0).toBeGreaterThanOrEqual(0);
      expect(r.bounds.x1).toBeLessThanOrEqual(1000);
      expect(r.bounds.y1).toBeLessThanOrEqual(1000);
      expect(r.pxPerUnit).toBe(ART_REGIONS[0].pxPerUnit);
      expect(regionSize(r).width).toBeGreaterThan(r.feather * 4);
    }
  });

  it('maps world to pixel and back exactly', () => {
    const r = ART_REGIONS[0];
    expect(worldToRegionPixel(r, r.bounds.x0, r.bounds.y0)).toEqual([0, 0]);
    expect(worldToRegionPixel(r, r.bounds.x1, r.bounds.y1)).toEqual([regionPixelSize(r).width, regionPixelSize(r).height]);
    const [px, py] = worldToRegionPixel(r, 520, 640);
    expect(regionPixelToWorld(r, px, py)).toEqual([520, 640]);
  });
});

describe('Uchkeken region reference package', () => {
  const region = ART_REGIONS.find((r) => r.id === 'uchkeken-region')!;
  const dir = join(process.cwd(), 'artwork-guides', region.id);
  const saved = JSON.parse(readFileSync(join(dir, 'region-manifest.json'), 'utf8'));
  const fresh = JSON.parse(JSON.stringify(buildManifest(region, gazetteerPlaces(), features)));

  it('contains the places the brief names, where the gazetteer puts them', () => {
    for (const slug of ['uchkeken', 'heart-of-uchkeken', 'elendrath', 'harrowmere', 'dun-ommar']) {
      const g = GAZETTEER.find((e) => e.id === slug)!;
      expect(inRegion(region, g.at[0], g.at[1])).toBe(true);
      const a = saved.anchors.find((x: { id: string }) => x.id === `location:${slug}`);
      expect(a.world).toEqual(g.at);
      expect(a.pixel).toEqual(worldToRegionPixel(region, g.at[0], g.at[1]));
      expect(a.canon).toBe('confirmed-canon');
    }
  });

  it('matches the current geography data (re-run `npm run art:guides` if this fails)', () => {
    const geometry = (m: typeof saved) => ({
      bounds: m.bounds, image: m.image, transform: m.transform,
      anchors: m.anchors.map((a: { id: string; world: number[]; pixel: number[] }) => [a.id, a.world, a.pixel]),
      terrainRegions: m.terrainRegions, ridgelines: m.ridgelines, rivers: m.rivers, lakes: m.lakes, roads: m.roads,
      pointFeatures: m.pointFeatures, proposedAdditions: m.proposedAdditions,
    });
    expect(geometry(saved)).toEqual(geometry(fresh));
  });

  it('keeps the three canon categories apart', () => {
    const proposed = featuresInRegion(region, [...ATLAS_FEATURES]).filter((f) => f.status === 'proposed').map((f) => f.id);
    expect(saved.proposedAdditions).toEqual(proposed);
    const all = [...saved.terrainRegions, ...saved.ridgelines, ...saved.rivers, ...saved.lakes, ...saved.roads, ...saved.pointFeatures];
    for (const f of all) {
      expect(f.canon).toBe(proposed.includes(f.id) ? 'proposed-atlas-addition' : 'atlas-interpretation');
      if (f.canon === 'atlas-interpretation') expect(Array.isArray(f.basisQuotes)).toBe(true);
    }
    expect(all.some((f) => f.canon === 'confirmed-canon')).toBe(false);
  });

  it('has both guide images at the manifest size', () => {
    for (const file of ['geography-guide.png', 'artwork-guide.png']) {
      expect(pngSize(readFileSync(join(dir, file)))).toEqual({ width: saved.image.width, height: saved.image.height });
    }
    expect(saved.image).toMatchObject(regionPixelSize(region));
  });
});
