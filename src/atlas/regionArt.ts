/**
 * Loads the painted image of each illustrated region (src/atlas/regions.ts), if one has been
 * supplied under /atlas-art/regions/, and feathers its edges so it blends into the terrain or the
 * neighbouring painting around it. With no files present this resolves to an empty list and the
 * procedural terrain is drawn exactly as before.
 */
import { ART_REGIONS, REGION_ART_EXTENSIONS, regionArtUrl, regionSize, type ArtRegion } from './regions';

export interface RegionArt {
  region: ArtRegion;
  image: CanvasImageSource;
}

function probe(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Fade the image to transparent over `feather` world units at all four edges. */
function feathered(img: HTMLImageElement, region: ArtRegion): CanvasImageSource {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const size = regionSize(region);
  const fx = Math.min(0.49, region.feather / size.width);
  const fy = Math.min(0.49, region.feather / size.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx || !region.feather) return img;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  for (const [x1, y1, f] of [[w, 0, fx], [0, h, fy]] as const) {
    const g = ctx.createLinearGradient(0, 0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(f, 'rgba(0,0,0,1)');
    g.addColorStop(1 - f, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  return canvas;
}

let cached: Promise<RegionArt[]> | null = null;

/** One probe per region per session. */
export function loadRegionArt(): Promise<RegionArt[]> {
  if (typeof Image === 'undefined') return Promise.resolve([]);
  cached ??= Promise.all(
    ART_REGIONS.map(async (region) => {
      for (const ext of REGION_ART_EXTENSIONS) {
        const img = await probe(regionArtUrl(region.id, ext));
        if (img) return { region, image: feathered(img, region) };
      }
      return null;
    }),
  ).then((list) => list.filter((x): x is RegionArt => x !== null));
  return cached;
}
